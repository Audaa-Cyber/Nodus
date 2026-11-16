"use client";

import { useTransition } from "react";
import { cancelInvoiceAction } from "@/app/actions/invoices";

export default function CancelInvoiceForm({ invoiceId }: { invoiceId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        if (!window.confirm("Cancel this invoice? It cannot be reopened and will no longer be payable.")) {
          return;
        }
        startTransition(async () => {
          await cancelInvoiceAction(formData);
        });
      }}
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button className="button button-outline" type="submit" disabled={isPending}>
        {isPending && <span className="button-spinner" aria-hidden="true" />}
        {isPending ? "Cancelling…" : "Cancel invoice"}
      </button>
    </form>
  );
}
