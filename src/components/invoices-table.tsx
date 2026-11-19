"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { effectiveStatus, formatMoney, formatUtcDate, type InvoiceStatus } from "@/lib/invoices";
import { useInvoiceRealtime } from "@/components/invoice-realtime-provider";
import { applyInvoiceUpdate, mergeInvoiceSnapshot, type InvoiceRealtimeUpdate } from "@/lib/realtime/invoice-state";

export interface InvoiceListItem {
  id: string;
  invoice_number: string;
  customer_name?: string | null;
  customer_email?: string | null;
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
  queryString?: string;
  hasFilters?: boolean;
  hasError?: boolean;
}

export function InvoicesTable({
  initialInvoices,
  count,
  page,
  pageSize,
  totalPages,
  queryString = "",
  hasFilters = false,
  hasError,
}: InvoicesTableProps) {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>(initialInvoices);
  const [updatedRowIds, setUpdatedRowIds] = useState<Set<string>>(new Set());
  const liveUpdatesRef = useRef(new Map<string, InvoiceRealtimeUpdate>());
  const { subscribeToInvoices } = useInvoiceRealtime();

  // Keep state synchronized with server props when route parameters change or server revalidates
  useEffect(() => {
    setInvoices(mergeInvoiceSnapshot(initialInvoices, liveUpdatesRef.current));
    for (const invoice of initialInvoices) {
      if (liveUpdatesRef.current.get(invoice.id)?.status === invoice.status) {
        liveUpdatesRef.current.delete(invoice.id);
      }
    }
  }, [initialInvoices]);

  // Subscribe to live Realtime updates from the business channel
  useEffect(() => {
    return subscribeToInvoices((updated) => {
      liveUpdatesRef.current.set(updated.id, updated);
      setInvoices((prev) => applyInvoiceUpdate(prev, updated) as InvoiceListItem[]);
      setUpdatedRowIds((prev) => new Set(prev).add(updated.id));
      const timer = window.setTimeout(() => {
        setUpdatedRowIds((prev) => {
          const next = new Set(prev);
          next.delete(updated.id);
          return next;
        });
      }, 1400);
      return () => window.clearTimeout(timer);
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
          {hasFilters ? "No invoices match these filters." : "No invoices yet."}
        </p>
        {!hasFilters && <Link href="/dashboard/invoices/new" className="text-xs font-semibold hover:underline inline-block text-slate-900">Create your first invoice →</Link>}
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
                <tr
                  key={invoice.id}
                  className={`hover:bg-slate-500/5 transition-colors ${updatedRowIds.has(invoice.id) ? "row-status-updated" : ""}`}
                >
                  <td className="min-w-0 py-3 px-2 font-medium sm:px-4">
                    <Link
                      href={`/dashboard/invoices/${invoice.id}`}
                      className="break-all hover:underline"
                    >
                      {invoice.invoice_number}
                    </Link>
                    {(invoice.customer_name || invoice.customer_email) && <span className="mt-1 block text-[10px] font-normal leading-relaxed text-slate-500">{invoice.customer_name}{invoice.customer_name && invoice.customer_email ? " · " : ""}{invoice.customer_email}</span>}
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
              href={`/dashboard/invoices?${queryString ? `${queryString}&` : ""}page=${page - 1}`}
              className="py-1 px-2.5 rounded-lg border text-xs font-medium hover:bg-slate-500/5 transition-colors"
              style={{ borderColor: "var(--card-border)" }}
            >
              ← Newer
            </Link>
          )}
          {page * pageSize < (count ?? 0) && (
            <Link
              href={`/dashboard/invoices?${queryString ? `${queryString}&` : ""}page=${page + 1}`}
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
