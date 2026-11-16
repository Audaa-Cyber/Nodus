import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getSafeInternalDestination,
  formatRelativeTime,
} from "../src/lib/notifications/helpers.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("URL Security: getSafeInternalDestination permits only trusted internal invoice paths", () => {
  // Valid dashboard invoice routes
  assert.equal(
    getSafeInternalDestination("/dashboard/invoices/b7d5e492-3d84-4861-9c84-123456789abc"),
    "/dashboard/invoices/b7d5e492-3d84-4861-9c84-123456789abc"
  );
  assert.equal(
    getSafeInternalDestination("/dashboard/invoices/INV-2026-0001"),
    "/dashboard/invoices/INV-2026-0001"
  );

  // External URLs are strictly rejected
  assert.equal(getSafeInternalDestination("https://evil.com/dashboard/invoices/123"), null);
  assert.equal(getSafeInternalDestination("http://localhost:3000/dashboard/invoices/123"), null);
  assert.equal(getSafeInternalDestination("//evil.com/dashboard/invoices/123"), null);

  // Script and protocol injection are rejected
  assert.equal(getSafeInternalDestination("javascript:alert(1)"), null);
  assert.equal(getSafeInternalDestination("data:text/html,<script>alert(1)</script>"), null);

  // Arbitrary paths are rejected
  assert.equal(getSafeInternalDestination("/dashboard/settings"), null);
  assert.equal(getSafeInternalDestination("/api/admin/users"), null);

  // Null, undefined, and empty strings
  assert.equal(getSafeInternalDestination(null), null);
  assert.equal(getSafeInternalDestination(undefined), null);
  assert.equal(getSafeInternalDestination(""), null);
  assert.equal(getSafeInternalDestination("   "), null);
});

test("Relative Time: formatRelativeTime outputs human-friendly relative durations", () => {
  const now = Date.now();

  // Seconds ago -> Just now
  assert.equal(formatRelativeTime(new Date(now - 15 * 1000).toISOString()), "Just now");

  // Minutes ago
  assert.equal(formatRelativeTime(new Date(now - 8 * 60 * 1000).toISOString()), "8m ago");

  // Hours ago
  assert.equal(formatRelativeTime(new Date(now - 3 * 3600 * 1000).toISOString()), "3h ago");

  // Days ago
  assert.equal(formatRelativeTime(new Date(now - 4 * 86400 * 1000).toISOString()), "4d ago");

  // Invalid date fallback
  assert.equal(formatRelativeTime("invalid-date"), "invalid-date");
});

test("UI Component: Notification bell renders with accessible ARIA attributes", async () => {
  const source = await read("../src/components/notification-center.tsx");

  assert.ok(source.includes('className="notification-bell-btn"'));
  assert.ok(source.includes('aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}'));
  assert.ok(source.includes('aria-expanded={isOpen}'));
  assert.ok(source.includes('aria-haspopup="dialog"'));
  assert.ok(source.includes('aria-controls="notification-panel"'));
  assert.ok(source.includes('className="notification-bell-icon"'));
});

test("UI Component: Unread count badge displays when unread > 0 and hides when zero or unavailable", async () => {
  const source = await read("../src/components/notification-center.tsx");

  assert.ok(source.includes('{unreadCount > 0 && status !== "unavailable" && ('));
  assert.ok(source.includes('className="notification-badge"'));
  assert.ok(source.includes('{unreadCount > 99 ? "99+" : unreadCount}'));
});

test("UI Component: Notification panel provides loading, empty, unavailable, and error states", async () => {
  const source = await read("../src/components/notification-center.tsx");

  // Loading state
  assert.ok(source.includes("notification-loading-state"));
  assert.ok(source.includes("notification-skeleton-row"));

  // Unavailable state when migration unapplied
  assert.ok(source.includes("notification-status-box is-unavailable"));
  assert.ok(source.includes("Notifications Pending Setup"));
  assert.ok(source.includes("The in-app notifications migration has not been applied to your database yet."));

  // Error state
  assert.ok(source.includes("notification-status-box is-error"));
  assert.ok(source.includes("Unable to Load Notifications"));

  // Empty state
  assert.ok(source.includes("notification-empty-state"));
  assert.ok(source.includes("All caught up"));
  assert.ok(source.includes("When invoice payments are verified, payment confirmation notices will appear here in real time."));
});

test("UI Component: Notification item displays title, message, relative time, and unread indicator", async () => {
  const source = await read("../src/components/notification-center.tsx");

  assert.ok(source.includes("notification-item"));
  assert.ok(source.includes("notification-unread-dot"));
  assert.ok(source.includes("notification-item-title"));
  assert.ok(source.includes("notification-item-time"));
  assert.ok(source.includes("notification-item-message"));
  assert.ok(source.includes("notification-item-link"));
  assert.ok(source.includes("View invoice"));
});

test("UI Component: Mark-as-read and mark-all-as-read are cleanly implemented", async () => {
  const source = await read("../src/components/notification-center.tsx");

  // Single mark as read
  assert.ok(source.includes("const markAsRead = async (id: string) => {"));
  assert.ok(source.includes('.update({ read_at: new Date().toISOString() })'));
  assert.ok(source.includes('.eq("id", id)'));

  // Mark all as read
  assert.ok(source.includes("const markAllAsRead = async () => {"));
  assert.ok(source.includes('.is("read_at", null)'));
  assert.ok(source.includes("notification-mark-all-btn"));
  assert.ok(source.includes("Mark all read"));
});

test("UI Component: Clicking notification navigates to verified invoice and marks it read", async () => {
  const source = await read("../src/components/notification-center.tsx");

  assert.ok(source.includes("const handleItemClick = async (notif: NotificationItem) => {"));
  assert.ok(source.includes("if (!notif.read_at) {"));
  assert.ok(source.includes("await markAsRead(notif.id);"));
  assert.ok(source.includes("const safeUrl = getSafeInternalDestination(notif.destination_url);"));
  assert.ok(source.includes("router.push(safeUrl);"));
});

test("Live Updates: Supabase Realtime subscribes for recipient and cleans up on unmount", async () => {
  const source = await read("../src/components/notification-center.tsx");

  // Channel named specifically per recipient
  assert.ok(source.includes('channel(`user-notifications:${recipientUserId}`)'));

  // postgres_changes listener for notifications table filtered by recipient_user_id
  assert.ok(source.includes('table: "notifications"'));
  assert.ok(source.includes('filter: `recipient_user_id=eq.${recipientUserId}`'));

  // Cleanup on unmount
  assert.ok(source.includes("supabase.removeChannel(channel);"));
});

test("Failure Handling: Detects missing table gracefully without mock data or dashboard crashes", async () => {
  const source = await read("../src/components/notification-center.tsx");

  // Detects Postgres missing relation error codes without throwing
  assert.ok(source.includes('error.code === "42P01"'));
  assert.ok(source.includes('error.code === "PGRST205"'));
  assert.ok(source.includes('setStatus("unavailable")'));

  // Does NOT invent fake mock data
  assert.doesNotMatch(source, /mockNotifications|fakeUnreadCount/);
});

test("Dashboard Layout: Integrates DashboardHeader with NotificationCenter into executive shell", async () => {
  const layout = await read("../src/app/dashboard/layout.tsx");
  const header = await read("../src/components/dashboard-header.tsx");

  assert.ok(layout.includes('import { DashboardHeader } from "@/components/dashboard-header";'));
  assert.ok(layout.includes("<DashboardHeader recipientUserId={user.id} userEmail={user.email} />"));
  assert.ok(header.includes("<NotificationCenter recipientUserId={recipientUserId} />"));
});

test("CSS Styles: Stylesheet defines all notification center classes and animations", async () => {
  const css = await read("../src/app/globals.css");

  assert.ok(css.includes(".dashboard-top-header"));
  assert.ok(css.includes(".notification-center-container"));
  assert.ok(css.includes(".notification-bell-btn"));
  assert.ok(css.includes(".notification-badge"));
  assert.ok(css.includes(".notification-panel"));
  assert.ok(css.includes(".notification-panel-header"));
  assert.ok(css.includes(".notification-item"));
  assert.ok(css.includes(".notification-empty-state"));
  assert.ok(css.includes(".notification-status-box"));
  assert.ok(css.includes("@keyframes panelSlideIn"));
});

test("HTML Validation: <button> elements are never nested inside another <button>", async () => {
  const source = await read("../src/components/notification-center.tsx");

  // Match the specific notification-item-btn tag and its direct contents up to its closing </button>
  const match = source.match(/<button[^>]*className="notification-item-btn"[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(match, "notification-item-btn must exist");
  const innerContent = match[1];

  // Assert no <button> tag exists inside notification-item-btn
  assert.doesNotMatch(innerContent, /<button/i, "notification-item-btn must never contain a nested <button>");
  assert.doesNotMatch(innerContent, /notification-item-mark-btn/, "notification-item-mark-btn must not be inside notification-item-btn");
});

test("Realtime Authorization: Injects active JWT session token via setAuth before subscribing", async () => {
  const source = await read("../src/components/notification-center.tsx");

  // Retrieves session token from client
  assert.ok(source.includes("supabase.auth.getSession()"));
  // Injects access token into Realtime client so RLS allows row broadcast
  assert.ok(source.includes("supabase.realtime.setAuth(session.access_token)"));
  // Cleans up existing duplicate channels with same topic
  assert.ok(source.includes("c.topic === `realtime:${topic}`"));
  assert.ok(source.includes("supabase.removeChannel(existing)"));
});

test("Realtime Lifecycle: Handles token refreshes and sign-out gracefully", async () => {
  const source = await read("../src/components/notification-center.tsx");

  // Listens for auth state changes
  assert.ok(source.includes("supabase.auth.onAuthStateChange"));
  assert.ok(source.includes('event === "TOKEN_REFRESHED" || event === "SIGNED_IN"'));
  assert.ok(source.includes('event === "SIGNED_OUT"'));
  // Unsubscribes auth listener on unmount
  assert.ok(source.includes("authListener.unsubscribe()"));
});

test("Realtime Deduplication & Recovery: Deduplicates incoming INSERT events and heals on network errors", async () => {
  const source = await read("../src/components/notification-center.tsx");

  // Realtime items merge by stable ID and unread badge is re-queried from the authoritative table.
  assert.ok(source.includes("mergeNotificationSnapshot(items, snapshotUnreadCount, liveChanges)"));
  assert.ok(source.includes("void refreshUnreadCount()"));
  // Error / timeout re-synchronization
  assert.ok(source.includes('subStatus === "CHANNEL_ERROR" || subStatus === "TIMED_OUT"'));
  assert.ok(source.includes("fetchNotifications();"));
});
