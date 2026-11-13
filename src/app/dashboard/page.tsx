import Link from "next/link";
import { redirect } from "next/navigation";
import { getBusinessContext } from "@/lib/auth/business-context";
import { effectiveStatus, formatMoney, formatUtcDate } from "@/lib/invoices";
import { withTransitionDelay } from "@/lib/utils/timing";

export default async function DashboardPage() {
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

  const today = new Date().toISOString().slice(0, 10);
  const [allInvoicesResult, recent] = await withTransitionDelay(
    Promise.all([
      supabase
        .from("invoices")
        .select("status,due_date")
        .eq("business_id", business.id),
      supabase
        .from("invoices")
        .select("id,invoice_number,customer_name,amount_minor,currency,status,due_date,issue_date,created_at")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .limit(6),
    ]),
    700
  );

  let totalCount = 0;
  let openCount = 0;
  let paidCount = 0;
  let overdueCount = 0;

  if (allInvoicesResult.data) {
    totalCount = allInvoicesResult.data.length;
    for (const inv of allInvoicesResult.data) {
      const status = effectiveStatus(inv, today);
      if (status === "open") openCount++;
      else if (status === "paid") paidCount++;
      else if (status === "overdue") overdueCount++;
    }
  }

  const statError = Boolean(allInvoicesResult.error);
  const stats = [
    ["Total invoices", totalCount],
    ["Open invoices", openCount],
    ["Paid invoices", paidCount],
    ["Overdue invoices", overdueCount],
  ] as const;

  const isConfigured = Boolean(business.receiving_address);

  return (
    <div className="w-full max-w-[760px] mx-auto space-y-6">
      {/* Section Header */}
      <div className="stagger-item delay-1">
        <span className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>
          BUSINESS
        </span>
        <h1 className="text-3xl sm:text-[34px] font-bold tracking-tight text-slate-900 mb-1.5">
          Overview
        </h1>
        <p className="text-xs sm:text-sm" style={{ color: "var(--text-secondary)" }}>
          Settlement summary and receiving route status for {business.business_name}.
        </p>
      </div>

      {/* Active Destination Card (Matches Executive View 2) */}
      <div className="card-perspective stagger-item delay-2">
        <div className="aether-card p-6 sm:p-7">
          <div className="top-highlight" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: "var(--text-muted)" }}>
                  ACTIVE DESTINATION
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  {business.business_name} · {(business.receiving_network || "base").toUpperCase()} Network
                </h3>
              </div>
              <span
                className={`font-mono-code text-xs px-2.5 py-1 rounded-full font-semibold ${
                  isConfigured ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                }`}
              >
                {isConfigured ? "Quote Ready" : "Pending Setup"}
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {isConfigured ? (
                <>
                  Your settlement destination is configured on <strong className="text-slate-900">{business.receiving_network || "base"}</strong> for{" "}
                  <span className="font-mono-code text-slate-800 break-all">{business.receiving_address}</span>.
                </>
              ) : (
                <>No receiving wallet address configured yet. Set up a destination in Business profile to generate instant cross-chain quotes.</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Metric Stats Grid */}
      <div className="stagger-item delay-3">
        {statError ? (
          <p className="text-xs text-rose-500" role="alert">
            Invoice summary could not be loaded.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.map(([label, value]) => (
              <div
                key={label}
                className="aether-card p-4 flex flex-col justify-between rounded-[18px]"
              >
                <span className="text-[11px] font-medium block mb-2" style={{ color: "var(--text-muted)" }}>
                  {label}
                </span>
                <strong className="text-2xl font-bold tracking-tight text-slate-900">
                  {value}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity / Invoices Table */}
      <div className="stagger-item delay-4">
        <div className="flex items-center justify-between mb-3 px-1">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: "var(--text-muted)" }}>
              LATEST ACTIVITY
            </span>
            <h2 className="text-sm font-bold text-slate-900">Recent invoices</h2>
          </div>
          <Link
            href="/dashboard/invoices"
            className="text-xs font-medium hover:text-slate-900 transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            All invoices →
          </Link>
        </div>

        <div className="aether-card overflow-hidden">
          <div className="top-highlight" />
          <div className="relative z-10">
            {recent.error ? (
              <p className="p-6 text-xs text-rose-500">Invoices could not be loaded.</p>
            ) : recent.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "var(--card-border)" }}>
                      <th className="py-3 px-4 font-semibold text-slate-800">Invoice</th>
                      <th className="py-3 px-4 font-semibold text-slate-800">Customer</th>
                      <th className="py-3 px-4 font-semibold text-slate-800">Issue date</th>
                      <th className="py-3 px-4 font-semibold text-slate-800">Amount</th>
                      <th className="py-3 px-4 font-semibold text-slate-800">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: "var(--card-border)" }}>
                    {recent.data.map((invoice) => {
                      const status = effectiveStatus(invoice, today);
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
                            {formatUtcDate(invoice.issue_date)}
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
            ) : (
              <div className="p-8 text-center space-y-1">
                <p className="text-xs font-medium text-slate-600">
                  No invoices recorded yet.
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Invoices and customer settlement activity will display here as they occur.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
