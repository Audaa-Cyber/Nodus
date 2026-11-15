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
  const listenersRef = useRef<Set<InvoiceListener>>(new Set());
  const hasSubscribedInitialRef = useRef<boolean>(false);

  const subscribeToInvoices = useCallback((listener: InvoiceListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!businessId) return;

    let isCancelled = false;
    let channel: ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null = null;
    let authListener: { unsubscribe: () => void } | null = null;
    let refreshDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

    const triggerRefresh = () => {
      if (refreshDebounceTimeout) clearTimeout(refreshDebounceTimeout);
      refreshDebounceTimeout = setTimeout(() => {
        router.refresh();
      }, 120);
    };

    const setupRealtime = async () => {
      try {
        const supabase = getSupabaseBrowserClient();

        // 1. Explicitly authenticate Realtime client with the user's active session token.
        // In @supabase/ssr, the browser client initializes with the anon key by default.
        // Without setAuth(token), the Realtime WebSocket connects as "anon", where auth.uid() is null,
        // causing Postgres RLS to silently drop all incoming invoice events.
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            await supabase.realtime.setAuth(session.access_token);
          }
        } catch {
          // Continue if session lookup fails
        }

        if (isCancelled) return;

        // 2. Clean up any existing channel with this topic to avoid duplicate subscriptions
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
              event: "*",
              schema: "public",
              table: "invoices",
              filter: `business_id=eq.${businessId}`,
            },
            (payload) => {
              if (payload.eventType === "UPDATE") {
                const updated = payload.new as InvoiceRealtimeUpdate;
                if (!updated || !updated.id) return;

                // Notify all active component listeners immediately (e.g. InvoicesTable, InvoiceDetailLiveSync)
                listenersRef.current.forEach((listener) => {
                  try {
                    listener(updated);
                  } catch (err) {
                    console.error("Error in invoice update listener:", err);
                  }
                });
              }

              // For any invoice mutation (UPDATE, INSERT, DELETE), trigger server revalidation
              triggerRefresh();
            }
          )
          .subscribe(async (subStatus) => {
            if (subStatus === "SUBSCRIBED") {
              // Close the initial-fetch / subscription race window:
              // If an invoice transition occurred while the initial page HTML was rendering/loading,
              // re-sync once when the live channel is established.
              if (!hasSubscribedInitialRef.current) {
                hasSubscribedInitialRef.current = true;
                triggerRefresh();
              }
            } else if (subStatus === "CHANNEL_ERROR" || subStatus === "TIMED_OUT") {
              // On socket drop or timeout, re-fetch server state
              triggerRefresh();
            }
          });

        // 4. Keep Realtime authenticated across token refreshes
        const { data: authData } = supabase.auth.onAuthStateChange(async (event, session) => {
          if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && session?.access_token) {
            try {
              await supabase.realtime.setAuth(session.access_token);
            } catch {
              // Ignore
            }
          }
        });
        authListener = authData?.subscription ?? null;
      } catch {
        // Fallback for unconfigured environments
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
  }, [businessId, router]);

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
