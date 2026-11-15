"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { effectiveStatus, formatMoney, formatUtcDate, type InvoiceStatus } from "@/lib/invoices";
import { useInvoiceRealtime } from "@/components/invoice-realtime-provider";

export interface InvoiceListItem {
  id: string;
  invoice_number: string;
  amount_minor: number;
  currency: string;
  status: InvoiceStatus;
  due_date: string | null;
  created_at: string;
}

export interface InvoicesTableProps {
  initialInvoices: InvoiceListItem[];
  count: number | null;
  page: number;
  pageSize: number;
  totalPages: number;
  hasError?: boolean;
}

export function InvoicesTable({
  initialInvoices,
  count,
  page,
  pageSize,
  totalPages,
  hasError,
}: InvoicesTableProps) {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>(initialInvoices);
  const { subscribeToInvoices } = useInvoiceRealtime();

  // Keep state synchronized with server props when route parameters change or server revalidates
  useEffect(() => {
    setInvoices(initialInvoices);
  }, [initialInvoices]);

  // Subscribe to live Realtime updates from the business channel
  useEffect(() => {
    return subscribeToInvoices((updated) => {
      // Diagnostic 7: Whether the invoice table's React state update handler executes
      console.log("[NODUS:REALTIME] 7. InvoicesTable received update:", {
        id: updated.id,
        newStatus: updated.status,
      });

      setInvoices((prev) => {
        const found = prev.some((inv) => inv.id === updated.id);
        console.log("[NODUS:REALTIME] 7b. InvoicesTable state update executing. Matching row found:", found, "Invoice:", updated.id);
        return prev.map((inv) =>
          inv.id === updated.id
            ? {
                ...inv,
                status: (updated.status as InvoiceStatus) || inv.status,
                amount_minor:
                  typeof updated.amount_minor === "number" ? updated.amount_minor : inv.amount_minor,
                currency:
                  typeof updated.currency === "string" ? updated.currency : inv.currency,
                due_date:
                  updated.due_date !== undefined
                    ? (updated.due_date as string | null)
                    : inv.due_date,
              }
            : inv
        );
      });
    });
  }, [subscribeToInvoices]);

  if (hasError) {
    return (
      <p className="p-6 text-xs text-rose-500" role="alert">
        Invoices could not be loaded. Refresh the page to try again.
      </p>
    );
  }

  if (!invoices.length) {
    return (
      <div className="p-8 text-center space-y-2">
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          No invoices yet.
        </p>
        <Link
          href="/dashboard/invoices/new"
          className="text-xs font-semibold hover:underline inline-block text-slate-900"
        >
          Create your first invoice →
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--card-border)" }}>
              <th className="py-3 px-2 font-semibold text-slate-800 sm:px-4">Invoice</th>
              <th className="hidden py-3 px-4 font-semibold text-slate-800 sm:table-cell">Created</th>
              <th className="hidden py-3 px-4 font-semibold text-slate-800 sm:table-cell">Due date</th>
              <th className="py-3 px-2 font-semibold text-slate-800 sm:px-4">Amount</th>
              <th className="py-3 px-2 font-semibold text-slate-800 sm:px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "var(--card-border)" }}>
            {invoices.map((invoice) => {
              const status = effectiveStatus(invoice);
              return (
                <tr key={invoice.id} className="hover:bg-slate-500/5 transition-colors">
                  <td className="min-w-0 py-3 px-2 font-medium sm:px-4">
                    <Link
                      href={`/dashboard/invoices/${invoice.id}`}
                      className="break-all hover:underline"
                    >
                      {invoice.invoice_number}
                    </Link>
                    <span className="mt-1 block text-[10px] font-normal leading-relaxed text-slate-500 sm:hidden">
                      Created {formatUtcDate(invoice.created_at)} · Due{" "}
                      {invoice.due_date ? formatUtcDate(invoice.due_date) : "—"}
                    </span>
                  </td>
                  <td
                    className="hidden py-3 px-4 font-mono-code text-[11px] sm:table-cell"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {formatUtcDate(invoice.created_at)}
                  </td>
                  <td
                    className="hidden py-3 px-4 font-mono-code text-[11px] sm:table-cell"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {invoice.due_date ? formatUtcDate(invoice.due_date) : "—"}
                  </td>
                  <td className="whitespace-nowrap py-3 px-2 font-semibold text-slate-900 font-mono-code sm:px-4">
                    {formatMoney(invoice.amount_minor, invoice.currency)}
                  </td>
                  <td className="whitespace-nowrap py-3 px-2 sm:px-4">
                    <span className={`status status-${status}`}>{status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div
        className="flex items-center justify-between p-4 border-t text-xs"
        style={{ borderColor: "var(--card-border)" }}
      >
        <span style={{ color: "var(--text-secondary)" }}>
          Page {page} of {totalPages}
        </span>
        <div className="flex items-center gap-2">
          {page > 1 && (
            <Link
              href={`/dashboard/invoices?page=${page - 1}`}
              className="py-1 px-2.5 rounded-lg border text-xs font-medium hover:bg-slate-500/5 transition-colors"
              style={{ borderColor: "var(--card-border)" }}
            >
              ← Newer
            </Link>
          )}
          {page * pageSize < (count ?? 0) && (
            <Link
              href={`/dashboard/invoices?page=${page + 1}`}
              className="py-1 px-2.5 rounded-lg border text-xs font-medium hover:bg-slate-500/5 transition-colors"
              style={{ borderColor: "var(--card-border)" }}
            >
              Older →
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
