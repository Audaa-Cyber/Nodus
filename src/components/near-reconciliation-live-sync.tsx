"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useInvoiceRealtime } from "@/components/invoice-realtime-provider";

export function NearReconciliationLiveSync({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const { subscribeToNearReconciliation } = useInvoiceRealtime();

  useEffect(() => subscribeToNearReconciliation((update) => {
    if (update.invoice_id === invoiceId) router.refresh();
  }), [invoiceId, router, subscribeToNearReconciliation]);

  return null;
}
