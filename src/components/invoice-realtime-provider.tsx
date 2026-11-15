"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
  children: React.ReactNode;
}

export function InvoiceRealtimeProvider({
  businessId,
  children,
}: InvoiceRealtimeProviderProps) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const listenersRef = useRef<Set<InvoiceListener>>(new Set());
  const hasSubscribedInitialRef = useRef<boolean>(false);

  // Diagnostic 1: Provider mounted and business ID resolved
  useEffect(() => {
    console.log("[NODUS:REALTIME] 1. Provider mounted. Resolved business ID:", businessId ? businessId : "(null/undefined)");
  }, [businessId]);

  const subscribeToInvoices = useCallback((listener: InvoiceListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!businessId) {
      console.warn("[NODUS:REALTIME] Provider has no businessId; skipping Realtime subscription.");
      return;
    }

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

        // Diagnostic 2: Authenticated Supabase session available
        let session = null;
        try {
          const sessionRes = await supabase.auth.getSession();
          session = sessionRes.data?.session ?? null;
          console.log("[NODUS:REALTIME] 2. Supabase session checked. Session available:", Boolean(session), "Has access_token:", Boolean(session?.access_token), "User ID:", session?.user?.id ?? null);
          if (session?.access_token) {
            await supabase.realtime.setAuth(session.access_token);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[NODUS:REALTIME] 2. Error fetching session / setting auth:", msg);
        }

        if (isCancelled) return;

        // Clean up any existing channel with this topic to avoid duplicate subscriptions
        const topic = `business-invoices:${businessId}`;
        const existing = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
        if (existing) {
          try {
            console.log("[NODUS:REALTIME] Removing existing channel before subscribing:", existing.topic);
            await supabase.removeChannel(existing);
          } catch {
            // Ignore channel removal error
          }
        }

        if (isCancelled) return;

        console.log("[NODUS:REALTIME] Creating channel topic:", topic, "with filter: business_id=eq." + businessId);

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
              // Diagnostic 4: Whether an invoice UPDATE event is received
              console.log("[NODUS:REALTIME] 4. postgres_changes event received. Event type:", payload.eventType, "Table:", payload.table);

              const updated = payload.new as InvoiceRealtimeUpdate;
              if (!updated || !updated.id) {
                console.warn("[NODUS:REALTIME] Received payload without valid payload.new.id:", payload);
                return;
              }

              // Diagnostic 5: Whether the received event's new.business_id matches the active business
              const matchesBusiness = updated.business_id === businessId;
              console.log("[NODUS:REALTIME] 5. business_id check. Event business_id:", updated.business_id, "Active businessId:", businessId, "Matches:", matchesBusiness);

              // Diagnostic 6: Whether the invoice ID and new status are correctly extracted
              console.log("[NODUS:REALTIME] 6. Extracted invoice data:", {
                invoiceId: updated.id,
                status: updated.status,
                invoiceNumber: updated.invoice_number,
                amountMinor: updated.amount_minor,
              });

              // Notify all active component listeners immediately (e.g. InvoicesTable, InvoiceDetailLiveSync)
              console.log("[NODUS:REALTIME] Notifying active listeners count:", listenersRef.current.size);
              listenersRef.current.forEach((listener) => {
                try {
                  listener(updated);
                } catch (err) {
                  console.error("[NODUS:REALTIME] Error in invoice update listener:", err);
                }
              });

              // Trigger server revalidation
              triggerRefresh();
            }
          )
          .subscribe(async (subStatus, err) => {
            // Diagnostic 3: Realtime channel subscription status
            console.log("[NODUS:REALTIME] 3. Realtime subscription status:", subStatus, "Topic:", topic, err ? { error: err.message } : "");

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
          console.log("[NODUS:REALTIME] Auth state change event:", event, "Has new token:", Boolean(newSession?.access_token));
          if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && newSession?.access_token) {
            try {
              await supabase.realtime.setAuth(newSession.access_token);
            } catch {
              // Ignore
            }
          }
        });
        authListener = authData?.subscription ?? null;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[NODUS:REALTIME] Setup error:", msg);
      }
    };

    setupRealtime();

    return () => {
      isCancelled = true;
      console.log("[NODUS:REALTIME] Cleanup called for topic:", `business-invoices:${businessId}`);
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
  }, [businessId]);

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
