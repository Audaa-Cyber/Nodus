"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type InvoiceRealtimeUpdate = {
  id: string;
  business_id: string;
  invoice_number?: string;
  status: string;
  amount_minor?: number;
  currency?: string;
  due_date?: string | null;
  [key: string]: unknown;
};

type InvoiceListener = (invoice: InvoiceRealtimeUpdate) => void;

interface InvoiceRealtimeContextValue {
  businessId: string | null;
  subscribeToInvoices: (listener: InvoiceListener) => () => void;
}

const InvoiceRealtimeContext = createContext<InvoiceRealtimeContextValue>({
  businessId: null,
  subscribeToInvoices: () => () => {},
});

export function useInvoiceRealtime() {
  return useContext(InvoiceRealtimeContext);
}

interface InvoiceRealtimeProviderProps {
  businessId?: string | null;
  userId: string;
  children: React.ReactNode;
}

export function InvoiceRealtimeProvider({
  businessId,
  userId,
  children,
}: InvoiceRealtimeProviderProps) {
  const router = useRouter();
  const { accessToken, loading: authLoading } = useAccessToken();
  const routerRef = useRef(router);
  routerRef.current = router;

  const listenersRef = useRef<Set<InvoiceListener>>(new Set());
  const hasSubscribedInitialRef = useRef<boolean>(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[NODUS:REALTIME] dashboard provider mounted; business resolved:", Boolean(businessId));
    }
  }, [businessId]);

  const subscribeToInvoices = useCallback((listener: InvoiceListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!businessId || authLoading || !accessToken) {
      if (process.env.NODE_ENV !== "production") console.warn("[NODUS:REALTIME] subscription skipped: business context unavailable");
      return;
    }

    hasSubscribedInitialRef.current = false;
    let isCancelled = false;
    let channel: ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null = null;
    let refreshDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

    const triggerRefresh = () => {
      if (refreshDebounceTimeout) clearTimeout(refreshDebounceTimeout);
      refreshDebounceTimeout = setTimeout(() => {
        const router = routerRef.current;
        router.refresh();
      }, 120);
    };

    const setupRealtime = async () => {
      try {
        const supabase = getSupabaseBrowserClient(accessToken);

        await supabase.realtime.setAuth(accessToken);

        if (isCancelled) return;

        // Clean up any existing channel with this topic to avoid duplicate subscriptions
        const topic = `business-invoices:${businessId}`;
        const existing = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
        if (existing) {
          try {
            await supabase.removeChannel(existing);
          } catch {
            // Ignore channel removal error
          }
        }

        if (isCancelled) return;

        // 3. Create and subscribe authenticated channel scoped to the business ID
        channel = supabase
          .channel(topic)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "invoices",
              filter: `business_id=eq.${businessId}`,
            },
            (payload) => {
              if (payload.new.business_id === businessId) triggerRefresh();
            },
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "invoices",
              filter: `business_id=eq.${businessId}`,
            },
            (payload) => {
              if (process.env.NODE_ENV !== "production") console.debug("[NODUS:REALTIME] database event received:", payload.eventType);

              const updated = payload.new as InvoiceRealtimeUpdate;
              if (!updated || !updated.id) {
                if (process.env.NODE_ENV !== "production") console.warn("[NODUS:REALTIME] ignored invoice event without an ID");
                return;
              }

              // Diagnostic 5: Whether the received event's new.business_id matches the active business
              const matchesBusiness = updated.business_id === businessId;
              if (!matchesBusiness) return;

              if (process.env.NODE_ENV !== "production") console.debug("[NODUS:REALTIME] invoice handler dispatching; listeners:", listenersRef.current.size);
              listenersRef.current.forEach((listener) => {
                try {
                  listener(updated);
                } catch {
                  if (process.env.NODE_ENV !== "production") console.warn("[NODUS:REALTIME] invoice listener threw");
                }
              });

              // Trigger server revalidation
              triggerRefresh();
            }
          )
          .subscribe(async (subStatus) => {
            if (process.env.NODE_ENV !== "production") console.debug("[NODUS:REALTIME] subscription status:", subStatus);

            if (subStatus === "SUBSCRIBED") {
              if (!hasSubscribedInitialRef.current) {
                hasSubscribedInitialRef.current = true;
                triggerRefresh();
              }
            } else if (subStatus === "CHANNEL_ERROR" || subStatus === "TIMED_OUT") {
              triggerRefresh();
            }
          });


      } catch (err: unknown) {
        const code = err && typeof err === "object" && "code" in err ? String(err.code) : "unknown";
        if (process.env.NODE_ENV !== "production") console.warn("[NODUS:REALTIME] setup failed:", code);
      }
    };

    setupRealtime();

    // Recover missed events after reconnecting or returning to this tab. Also
    // recalculate date-derived overdue counts when the UTC date changes.
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") triggerRefresh();
    };
    const refreshInterval = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      isCancelled = true;
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (refreshDebounceTimeout) clearTimeout(refreshDebounceTimeout);
      if (channel) {
        try {
          const supabase = getSupabaseBrowserClient(accessToken);
          supabase.removeChannel(channel);
        } catch {
          // ignore cleanup error
        }
      }
    };
  }, [businessId, userId, accessToken, authLoading]);

  return (
    <InvoiceRealtimeContext.Provider
      value={{
        businessId: businessId ?? null,
        subscribeToInvoices,
      }}
    >
      {children}
    </InvoiceRealtimeContext.Provider>
  );
}
