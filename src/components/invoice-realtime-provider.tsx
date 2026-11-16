"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseNearReconciliationUpdate, type NearReconciliationUpdate } from "@/lib/realtime/near-reconciliation-state";

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
type NearReconciliationListener = (update: NearReconciliationUpdate) => void;

interface InvoiceRealtimeContextValue {
  businessId: string | null;
  subscribeToInvoices: (listener: InvoiceListener) => () => void;
  subscribeToNearReconciliation: (listener: NearReconciliationListener) => () => void;
}

const InvoiceRealtimeContext = createContext<InvoiceRealtimeContextValue>({
  businessId: null,
  subscribeToInvoices: () => () => {},
  subscribeToNearReconciliation: () => () => {},
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
  const routerRef = useRef(router);
  routerRef.current = router;

  const listenersRef = useRef<Set<InvoiceListener>>(new Set());
  const nearListenersRef = useRef<Set<NearReconciliationListener>>(new Set());
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

  const subscribeToNearReconciliation = useCallback((listener: NearReconciliationListener) => {
    nearListenersRef.current.add(listener);
    return () => {
      nearListenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!businessId) {
      if (process.env.NODE_ENV !== "production") console.warn("[NODUS:REALTIME] subscription skipped: business context unavailable");
      return;
    }

    hasSubscribedInitialRef.current = false;
    let isCancelled = false;
    let channel: ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null = null;
    let authListener: { unsubscribe: () => void } | null = null;
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
        const supabase = getSupabaseBrowserClient();

        let session = null;
        try {
          const sessionRes = await supabase.auth.getSession();
          session = sessionRes.data?.session ?? null;
          if (session?.access_token && session.user.id === userId) {
            await supabase.realtime.setAuth(session.access_token);
          } else {
            if (process.env.NODE_ENV !== "production") console.warn("[NODUS:REALTIME] subscription skipped: authenticated session unavailable");
            return;
          }
        } catch (err: unknown) {
          const code = err && typeof err === "object" && "code" in err ? String(err.code) : "unknown";
          if (process.env.NODE_ENV !== "production") console.warn("[NODUS:REALTIME] auth setup failed:", code);
          return;
        }

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
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "near_reconciliation_status",
              filter: `business_id=eq.${businessId}`,
            },
            (payload) => {
              const update = parseNearReconciliationUpdate(payload.new, businessId);
              if (!update) return;
              if (process.env.NODE_ENV !== "production") console.debug("[NODUS:REALTIME] NEAR status event received:", update.status);
              nearListenersRef.current.forEach((listener) => {
                try {
                  listener(update);
                } catch {
                  // A component listener must not interrupt the shared channel.
                }
              });
            },
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

        // Keep Realtime authenticated across token refreshes
        const { data: authData } = supabase.auth.onAuthStateChange(async (event, newSession) => {
          if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && newSession?.access_token && newSession.user.id === userId) {
            try {
              await supabase.realtime.setAuth(newSession.access_token);
            } catch {
              if (process.env.NODE_ENV !== "production") console.warn("[NODUS:REALTIME] token refresh auth update failed");
            }
          } else if (event === "SIGNED_OUT") {
            listenersRef.current.clear();
            nearListenersRef.current.clear();
          }
        });
        authListener = authData?.subscription ?? null;
      } catch (err: unknown) {
        const code = err && typeof err === "object" && "code" in err ? String(err.code) : "unknown";
        if (process.env.NODE_ENV !== "production") console.warn("[NODUS:REALTIME] setup failed:", code);
      }
    };

    setupRealtime();

    return () => {
      isCancelled = true;
      if (refreshDebounceTimeout) clearTimeout(refreshDebounceTimeout);
      if (authListener) {
        try {
          authListener.unsubscribe();
        } catch {
          // ignore
        }
      }
      if (channel) {
        try {
          const supabase = getSupabaseBrowserClient();
          supabase.removeChannel(channel);
        } catch {
          // ignore cleanup error
        }
      }
    };
  }, [businessId, userId]);

  return (
    <InvoiceRealtimeContext.Provider
      value={{
        businessId: businessId ?? null,
        subscribeToInvoices,
        subscribeToNearReconciliation,
      }}
    >
      {children}
    </InvoiceRealtimeContext.Provider>
  );
}
