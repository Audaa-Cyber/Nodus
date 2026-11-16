"use client";

import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { useMemo } from "react";
import { effectiveStatus, formatMoney, formatUtcDate, type Invoice } from "@/lib/invoices";
import { useSnapshotHighlights } from "@/components/use-data-motion";

type RecentInvoice = Pick<Invoice, "id" | "invoice_number" | "amount_minor" | "currency" | "status" | "due_date" | "issue_date">;

export function OverviewRecentInvoices({ invoices, today }: { invoices: RecentInvoice[] | null; today: string }) {
  // Status always comes from the fresh server snapshot; socket events only
  // request that snapshot through the existing shared provider.
  const snapshot = useMemo(() => invoices?.map((invoice) => ({
    id: invoice.id, status: effectiveStatus(invoice, today),
  })) ?? null, [invoices, today]);
  const highlights = useSnapshotHighlights(snapshot, "paid");
  if (!invoices) return <p className="overview-error" role="alert">Invoices could not be loaded. Refresh the page to try again.</p>;
  if (!invoices.length) return (
    <div className="overview-empty">
      <FileText size={28} strokeWidth={1.3} aria-hidden="true" />
      <h3>No invoices recorded yet</h3>
      <p>Create an invoice to accept USDC payments.</p>
      <Link href="/dashboard/invoices/new" className="overview-text-link">Create invoice <ArrowRight size={14} aria-hidden="true" /></Link>
    </div>
  );
  return (
    <table className="overview-invoice-table">
      <caption className="sr-only">Your four most recent invoices</caption>
      <thead><tr>
        <th scope="col">Invoice</th><th scope="col">Date</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Action</th>
      </tr></thead>
      <tbody>
        {invoices.map((invoice) => {
          const status = effectiveStatus(invoice, today);
          return (
            <tr key={invoice.id} className={highlights.has(invoice.id) && status === "paid" ? "overview-payment-arrived" : undefined}>
              <td data-label="Invoice"><Link href={`/dashboard/invoices/${invoice.id}`} className="overview-invoice-number">{invoice.invoice_number}</Link></td>
              <td data-label="Date">{formatUtcDate(invoice.issue_date)}</td>
              <td data-label="Amount" className="overview-invoice-amount">{formatMoney(invoice.amount_minor, invoice.currency)}</td>
              <td data-label="Status"><span className={`overview-status overview-status-${status}`}><span aria-hidden="true" />{status}</span></td>
              <td data-label="Action"><Link href={`/dashboard/invoices/${invoice.id}`} className="overview-text-link" aria-label={`View invoice ${invoice.invoice_number}`}>View <ArrowRight size={13} aria-hidden="true" /></Link></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
