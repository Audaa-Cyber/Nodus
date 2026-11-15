"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useInvoiceRealtime } from "@/components/invoice-realtime-provider";

export interface InvoiceDetailLiveSyncProps {
  invoiceId: string;
  currentStatus: string;
}

export function InvoiceDetailLiveSync({
  invoiceId,
  currentStatus,
}: InvoiceDetailLiveSyncProps) {
  const router = useRouter();
  const { subscribeToInvoices } = useInvoiceRealtime();
  const [transitioningStatus, setTransitioningStatus] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToInvoices((updated) => {
      if (updated.id === invoiceId && updated.status !== currentStatus) {
        setTransitioningStatus(updated.status);
        // Trigger server component refresh immediately so PaidInvoiceDetailView renders with receipts & settlements
        router.refresh();
      }
    });
  }, [invoiceId, currentStatus, subscribeToInvoices, router]);

  if (transitioningStatus === "paid") {
    return (
      <div
        className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-800 animate-pulse flex items-center justify-between"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-xs font-semibold">Payment verified! Updating invoice receipt…</span>
        </div>
      </div>
    );
  }

  return null;
}
