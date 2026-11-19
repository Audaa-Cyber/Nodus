"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { applyNotificationChange, mergeNotificationSnapshot, type NotificationChange, type NotificationItem } from "@/lib/realtime/notification-state";

export type { NotificationItem } from "@/lib/realtime/notification-state";

/**
 * Validate destination URL to ensure it is strictly a trusted internal dashboard route.
 * Prevents arbitrary external redirects or protocol injections.
 */
export { getSafeInternalDestination, formatRelativeTime } from "@/lib/notifications/helpers";
import { getSafeInternalDestination, formatRelativeTime } from "@/lib/notifications/helpers";

export interface NotificationCenterProps {
  recipientUserId: string;
}

export function NotificationCenter({ recipientUserId }: NotificationCenterProps) {
  const router = useRouter();
  const { accessToken, loading: authLoading } = useAccessToken();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [isBellRinging, setIsBellRinging] = useState(false);
  const freshIdsRef = useRef<Set<string>>(new Set());
  const unreadCountRef = useRef(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const bellButtonRef = useRef<HTMLButtonElement>(null);
  const unreadQueryVersion = useRef(0);

  useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

  const refreshUnreadCount = useCallback(async () => {
    if (!accessToken) return;
    const version = ++unreadQueryVersion.current;
    const { count, error } = await getSupabaseBrowserClient(accessToken)
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", recipientUserId)
      .is("read_at", null);
    if (version !== unreadQueryVersion.current) return;
    if (!error && typeof count === "number") {
      unreadCountRef.current = count;
      setUnreadCount(count);
    }
  }, [recipientUserId, accessToken]);

  // Fetch initial notifications and unread count
  const fetchNotifications = useCallback(async (liveChanges: NotificationChange[] = []) => {
    if (!recipientUserId || !accessToken) return;
    setStatus("loading");
    setErrorMessage(null);

    try {
      const supabase = getSupabaseBrowserClient(accessToken);

      // 1. Fetch latest 20 notifications
      const { data, error } = await supabase
        .from("notifications")
        .select("id,recipient_user_id,business_id,type,title,message,invoice_id,destination_url,created_at,read_at")
        .eq("recipient_user_id", recipientUserId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        // Detect unapplied migration or missing table gracefully
        const isMissingTable =
          error.code === "42P01" ||
          error.code === "PGRST205" ||
          error.code === "PGRST204" ||
          error.message?.toLowerCase().includes("does not exist") ||
          error.message?.toLowerCase().includes("could not find the table") ||
          error.message?.toLowerCase().includes("schema cache");

        if (isMissingTable) {
          setStatus("unavailable");
          setErrorMessage("Notification services are pending database setup. Apply the migration to enable in-app notifications.");
        } else {
          setStatus("error");
          setErrorMessage(error.message || "Failed to load notifications.");
        }
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      const items = (data ?? []) as NotificationItem[];

      // 2. Fetch total unread count
      const { count, error: countError } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", recipientUserId)
        .is("read_at", null);

      const snapshotUnreadCount = !countError && typeof count === "number"
        ? count
        : items.filter((n) => !n.read_at).length;
      const merged = mergeNotificationSnapshot(items, snapshotUnreadCount, liveChanges);
      setNotifications(merged.items);
      if (!countError && typeof count === "number") {
        const exactUnreadCount = merged.unreadCount;
        unreadCountRef.current = exactUnreadCount;
        setUnreadCount(exactUnreadCount);
      } else {
        const localUnread = merged.items.filter((n) => !n.read_at).length;
        unreadCountRef.current = localUnread;
        setUnreadCount(localUnread);
      }

      setStatus("ready");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Notification service unavailable";
      setStatus("unavailable");
      setErrorMessage(msg);
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [recipientUserId]);

  // Realtime subscription setup & cleanup
  useEffect(() => {
    if (!recipientUserId || authLoading || !accessToken) return;

    let isCancelled = false;
    let channel: ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null = null;
    const bufferedChanges: NotificationChange[] = [];
    let initialFetchInProgress = true;

    const setupRealtime = async () => {
      try {
        const supabase = getSupabaseBrowserClient(accessToken);

        await supabase.realtime.setAuth(accessToken);

        if (isCancelled) return;

        // Subscribe before the initial fetch. Events received while the fetch is in flight
        // are merged by ID so an insert cannot be lost or counted twice.
        const topic = `user-notifications:${recipientUserId}`;
        const existing = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
        if (existing) {
          try {
            await supabase.removeChannel(existing);
          } catch {
            // Ignore channel removal error
          }
        }

        if (isCancelled) return;

        channel = supabase
          .channel(`user-notifications:${recipientUserId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "notifications",
              filter: `recipient_user_id=eq.${recipientUserId}`,
            },
            (payload) => {
              if (payload.eventType === "INSERT") {
                const newItem = payload.new as NotificationItem;
                if (!newItem || !newItem.id) return;
                const change = { eventType: "INSERT" as const, item: newItem };
                if (initialFetchInProgress) bufferedChanges.push(change);
                freshIdsRef.current.add(newItem.id);
                setNotifications((prev) => {
                  const next = applyNotificationChange({ items: prev, unreadCount: unreadCountRef.current }, change);
                  return next.items;
                });
                if (!initialFetchInProgress) {
                  setIsBellRinging(true);
                  window.setTimeout(() => setIsBellRinging(false), 500);
                }
                void refreshUnreadCount();
                setStatus("ready");
              } else if (payload.eventType === "UPDATE") {
                const updated = payload.new as NotificationItem;
                if (!updated || !updated.id) return;
                const change = { eventType: "UPDATE" as const, item: updated };
                if (initialFetchInProgress) bufferedChanges.push(change);
                setNotifications((prev) => {
                  const next = applyNotificationChange({ items: prev, unreadCount: unreadCountRef.current }, change);
                  return next.items;
                });
                void refreshUnreadCount();
              }
            }
          )
          .subscribe(async (subStatus) => {
            if (subStatus === "CHANNEL_ERROR" || subStatus === "TIMED_OUT") {
              if (process.env.NODE_ENV !== "production") console.warn("[NODUS:REALTIME] notification channel reconnecting:", subStatus);
              setErrorMessage("Live updates disconnected. Reconnecting…");
              void fetchNotifications();
            } else if (subStatus === "SUBSCRIBED") {
              if (process.env.NODE_ENV !== "production") console.debug("[NODUS:REALTIME] notification channel subscribed");
            }
          });

        if (isCancelled) return;
        await fetchNotifications(bufferedChanges);
        initialFetchInProgress = false;


      } catch {
        if (!isCancelled) {
          setStatus("error");
          setErrorMessage("Live notifications could not connect. Try reopening the dashboard.");
          if (process.env.NODE_ENV !== "production") console.warn("[NODUS:REALTIME] notification setup failed");
        }
      }
    };

    setupRealtime();

    return () => {
      isCancelled = true;
      if (channel) {
        try {
          const supabase = getSupabaseBrowserClient(accessToken);
          supabase.removeChannel(channel);
        } catch {
          // ignore cleanup error
        }
      }
    };
  }, [recipientUserId, fetchNotifications, refreshUnreadCount, accessToken, authLoading]);

  // Handle outside click to close panel
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        bellButtonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Mark a single notification as read
  const markAsRead = async (id: string) => {
    if (!accessToken) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));

    try {
      const supabase = getSupabaseBrowserClient(accessToken);
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("recipient_user_id", recipientUserId);
    } catch {
      // Ignore background write failures
    }
  };

  // Mark all unread notifications as read
  const markAllAsRead = async () => {
    if (!accessToken) return;
    if (unreadCount === 0 || isMarkingAll) return;
    setIsMarkingAll(true);

    const nowIso = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || nowIso })));
    setUnreadCount(0);

    try {
      const supabase = getSupabaseBrowserClient(accessToken);
      await supabase
        .from("notifications")
        .update({ read_at: nowIso })
        .eq("recipient_user_id", recipientUserId)
        .is("read_at", null);
    } catch {
      // Revert if error occurs
    } finally {
      setIsMarkingAll(false);
    }
  };

  // Open invoice destination
  const handleItemClick = async (notif: NotificationItem) => {
    if (!notif.read_at) {
      await markAsRead(notif.id);
    }
    setIsOpen(false);

    const safeUrl = getSafeInternalDestination(notif.destination_url);
    if (safeUrl) {
      router.push(safeUrl);
    } else if (notif.invoice_id) {
      router.push(`/dashboard/invoices/${notif.invoice_id}`);
    }
  };

  return (
    <div className="notification-center-container" ref={containerRef}>
      {/* Notification Bell Button */}
      <button
        ref={bellButtonRef}
        type="button"
        className="notification-bell-btn"
        data-ringing={isBellRinging ? "true" : undefined}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls="notification-panel"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <svg
          className="notification-bell-icon"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {/* Compact Unread Badge - hidden when 0 or unavailable */}
        {unreadCount > 0 && status !== "unavailable" && (
          <span className="notification-badge" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Center Dropdown Panel */}
      {isOpen && (
        <div
          id="notification-panel"
          className="notification-panel"
          role="dialog"
          aria-label="Notification center"
        >
          {/* Panel Header */}
          <div className="notification-panel-header">
            <div className="notification-panel-title-row">
              <h2 className="notification-panel-title">Notifications</h2>
              {unreadCount > 0 && status === "ready" && (
                <span className="notification-unread-pill">
                  {unreadCount} unread
                </span>
              )}
            </div>

            {status === "ready" && unreadCount > 0 && (
              <button
                type="button"
                className="notification-mark-all-btn"
                onClick={markAllAsRead}
                disabled={isMarkingAll}
              >
                {isMarkingAll ? "Marking…" : "Mark all read"}
              </button>
            )}
          </div>

          {/* Panel Content Body */}
          <div className="notification-panel-body" role="region" aria-live="polite">
            {/* Loading State */}
            {status === "loading" && (
              <div className="notification-loading-state" aria-label="Loading notifications">
                <div className="notification-skeleton-row" />
                <div className="notification-skeleton-row" />
                <div className="notification-skeleton-row" />
              </div>
            )}

            {/* Unavailable State (migration unapplied) */}
            {status === "unavailable" && (
              <div className="notification-status-box is-unavailable">
                <div className="notification-status-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <h3 className="notification-status-title">Notifications Pending Setup</h3>
                <p className="notification-status-text">
                  {errorMessage || "The in-app notifications migration has not been applied to your database yet."}
                </p>
                <button
                  type="button"
                  className="notification-retry-btn"
                  onClick={() => void fetchNotifications()}
                >
                  Check again
                </button>
              </div>
            )}

            {/* Error State */}
            {status === "error" && (
              <div className="notification-status-box is-error">
                <div className="notification-status-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <h3 className="notification-status-title">Unable to Load Notifications</h3>
                <p className="notification-status-text">
                  {errorMessage || "An unexpected error occurred while fetching your notifications."}
                </p>
                <button
                  type="button"
                  className="notification-retry-btn"
                  onClick={() => void fetchNotifications()}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Empty State */}
            {status === "ready" && notifications.length === 0 && (
              <div className="notification-empty-state">
                <div className="notification-empty-icon" aria-hidden="true">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <h3 className="notification-empty-title">All caught up</h3>
                <p className="notification-empty-text">
                  When invoice payments are verified, payment confirmation notices will appear here in real time.
                </p>
              </div>
            )}

            {/* Notifications List */}
            {status === "ready" && notifications.length > 0 && (
              <ul className="notification-list" role="list">
                {notifications.map((notif) => {
                  const isUnread = !notif.read_at;
                  return (
                    <li
                      key={notif.id}
                      className={`notification-item ${isUnread ? "is-unread" : "is-read"} ${freshIdsRef.current.has(notif.id) ? "is-fresh-arrival" : ""}`}
                    >
                      <button
                        type="button"
                        className="notification-item-btn"
                        onClick={() => handleItemClick(notif)}
                        aria-label={`Notification: ${notif.title}. ${isUnread ? "Unread" : "Read"}. Click to view invoice.`}
                      >
                        <div className="notification-item-top">
                          <div className="notification-item-title-col">
                            {isUnread && <span className="notification-unread-dot" aria-hidden="true" />}
                            <span className="notification-item-title">{notif.title}</span>
                          </div>
                          <span className="notification-item-time">{formatRelativeTime(notif.created_at)}</span>
                        </div>

                        <p className="notification-item-message">{notif.message}</p>
                      </button>

                      <div className="notification-item-footer">
                        <button
                          type="button"
                          className="notification-item-link"
                          onClick={() => handleItemClick(notif)}
                          aria-label={`View invoice for ${notif.title}`}
                        >
                          <span>View invoice</span>
                          <span aria-hidden="true">→</span>
                        </button>

                        {isUnread && (
                          <button
                            type="button"
                            className="notification-item-mark-btn"
                            onClick={() => markAsRead(notif.id)}
                            aria-label="Mark this notification as read"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
