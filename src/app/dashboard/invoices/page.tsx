import Link from "next/link";
import { redirect } from "next/navigation";
import { getBusinessContext } from "@/lib/auth/business-context";
import { effectiveStatus, formatMoney, formatUtcDate } from "@/lib/invoices";
import { withTransitionDelay } from "@/lib/utils/timing";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 25;
  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login");
  if (!business) {
    return (
      <div className="card-perspective w-full max-w-[650px] mx-auto">
        <div className="aether-card p-6 sm:p-8">
          <h1 className="text-xl font-bold mb-2">Business profile unavailable</h1>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Apply the Supabase migration to finish setting up your business account.
          </p>
        </div>
      </div>
    );
  }

  const { data: invoices, count, error } = await withTransitionDelay(
    supabase
      .from("invoices")
      .select("id,invoice_number,customer_name,amount_minor,currency,status,due_date,created_at", { count: "exact" })
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1),
    700
  );

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  return (
    <div className="w-full max-w-[760px] mx-auto space-y-6">
      {/* Section Header */}
      <div className="stagger-item delay-1 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>
            BILLING
          </span>
          <h1 className="text-3xl sm:text-[34px] font-bold tracking-tight text-slate-900 mb-1.5">
            Invoices
          </h1>
          <p className="text-xs sm:text-sm" style={{ color: "var(--text-secondary)" }}>
            {count ?? 0} invoice{count === 1 ? "" : "s"} in your account.
          </p>
        </div>
        <Link href="/dashboard/invoices/new" className="btn-save-pill self-start sm:self-auto">
          <span>Create invoice ↗</span>
        </Link>
      </div>

      {/* Invoices Table Card */}
      <div className="card-perspective stagger-item delay-2">
        <div className="aether-card overflow-hidden">
          <div className="top-highlight" />
          <div className="relative z-10">
            {error ? (
              <p className="p-6 text-xs text-rose-500" role="alert">
                Invoices could not be loaded. Refresh the page to try again.
              </p>
            ) : invoices?.length ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b" style={{ borderColor: "var(--card-border)" }}>
                        <th className="py-3 px-4 font-semibold text-slate-800">Invoice</th>
                        <th className="py-3 px-4 font-semibold text-slate-800">Customer</th>
                        <th className="py-3 px-4 font-semibold text-slate-800">Created</th>
                        <th className="py-3 px-4 font-semibold text-slate-800">Due date</th>
                        <th className="py-3 px-4 font-semibold text-slate-800">Amount</th>
                        <th className="py-3 px-4 font-semibold text-slate-800">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: "var(--card-border)" }}>
                      {invoices.map((invoice) => {
                        const status = effectiveStatus(invoice);
                        return (
                          <tr key={invoice.id} className="hover:bg-slate-500/5 transition-colors">
                            <td className="py-3 px-4 font-medium">
                              <Link href={`/dashboard/invoices/${invoice.id}`} className="hover:underline">
                                {invoice.invoice_number}
                              </Link>
                            </td>
                            <td className="py-3 px-4" style={{ color: "var(--text-secondary)" }}>
                              {invoice.customer_name}
                            </td>
                            <td className="py-3 px-4 font-mono-code text-[11px]" style={{ color: "var(--text-muted)" }}>
                              {formatUtcDate(invoice.created_at)}
                            </td>
                            <td className="py-3 px-4 font-mono-code text-[11px]" style={{ color: "var(--text-muted)" }}>
                              {invoice.due_date ? formatUtcDate(invoice.due_date) : "—"}
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-900 font-mono-code">
                              {formatMoney(invoice.amount_minor, invoice.currency)}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`status status-${status}`}>
                                {status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between p-4 border-t text-xs" style={{ borderColor: "var(--card-border)" }}>
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
            ) : (
              <div className="p-8 text-center space-y-2">
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  No invoices yet.
                </p>
                <Link href="/dashboard/invoices/new" className="text-xs font-semibold hover:underline inline-block text-slate-900">
                  Create your first invoice →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
