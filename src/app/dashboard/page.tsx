import Link from "next/link";
import { redirect } from "next/navigation";
import { getBusinessContext } from "@/lib/auth/business-context";
import { effectiveStatus, formatMoney, formatUtcDate } from "@/lib/invoices";
import MerchantUsdcBalance from "@/components/merchant-usdc-balance";
import CopyWalletAddressButton from "@/components/copy-wallet-address-button";

function shortenAddress(address: string) {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

export default async function DashboardPage() {
  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login");
  if (!business) {
    return (
      <div className="w-full max-w-[650px] mx-auto">
        <div className="surface-card p-6 sm:p-8">
          <h1 className="text-xl font-bold mb-2">Business profile unavailable</h1>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Apply the Supabase migration to finish setting up your business account.
          </p>
        </div>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const [allInvoicesResult, recent] = await Promise.all([
      supabase
        .from("invoices")
        .select("status,due_date")
        .eq("business_id", business.id),
      supabase
        .from("invoices")
        .select("id,invoice_number,amount_minor,currency,status,due_date,issue_date,created_at")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

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

  const isConfigured = Boolean(business.receiving_address?.trim());

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
      </div>

      {/* Active Destination Card */}
      <div className="stagger-item delay-2">
        <div className="surface-card min-w-0 p-5 sm:p-7">
          <div className="relative z-10">
            <div className="flex min-w-0 flex-col gap-3 mb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: "var(--text-muted)" }}>
                  ACTIVE DESTINATION
                </span>
                <h3 className="break-words text-base font-bold text-slate-900 mt-0.5">
                  {business.business_name}
                </h3>
                <p className="mt-1 text-xs capitalize" style={{ color: "var(--text-secondary)" }}>
                  Network: {(business.receiving_network || "base").replaceAll("-", " ")}
                </p>
              </div>
              <span
                className="w-fit shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium text-slate-600"
                style={{ borderColor: "var(--card-border)" }}
              >
                {isConfigured ? "Address saved" : "Setup needed"}
              </span>
            </div>
            {isConfigured && business.receiving_address ? (
              <div className="flex min-w-0 items-center justify-between gap-3 border-t pt-3" style={{ borderColor: "var(--card-border)" }}>
                <span className="min-w-0 truncate font-mono-code text-xs text-slate-700" title={business.receiving_address}>
                  {shortenAddress(business.receiving_address)}
                </span>
                <CopyWalletAddressButton address={business.receiving_address} />
              </div>
            ) : (
              <Link href="/dashboard/settings" className="text-xs font-medium text-slate-700 underline underline-offset-2">
                Add receiving address
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* USDC Balance Widget — live balance for the merchant's receiving wallet */}
      <MerchantUsdcBalance />

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
                className="surface-card p-4 flex flex-col justify-between"
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

        <div className="surface-card overflow-hidden">
          <div className="relative z-10">
            {recent.error ? (
              <p className="p-6 text-xs text-rose-500">Invoices could not be loaded.</p>
            ) : recent.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "var(--card-border)" }}>
                      <th className="py-3 px-2 font-semibold text-slate-800 sm:px-4">Invoice</th>
                      <th className="hidden py-3 px-4 font-semibold text-slate-800 sm:table-cell">Issue date</th>
                      <th className="py-3 px-2 font-semibold text-slate-800 sm:px-4">Amount</th>
                      <th className="py-3 px-2 font-semibold text-slate-800 sm:px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: "var(--card-border)" }}>
                    {recent.data.map((invoice) => {
                      const status = effectiveStatus(invoice, today);
                      return (
                        <tr key={invoice.id} className="hover:bg-slate-500/5 transition-colors">
                          <td className="min-w-0 py-3 px-2 font-medium sm:px-4">
                            <Link href={`/dashboard/invoices/${invoice.id}`} className="break-all hover:underline">
                              {invoice.invoice_number}
                            </Link>
                            <span className="mt-1 block text-[10px] font-normal text-slate-500 sm:hidden">
                              Issue date {formatUtcDate(invoice.issue_date)}
                            </span>
                          </td>
                          <td className="hidden py-3 px-4 font-mono-code text-[11px] sm:table-cell" style={{ color: "var(--text-muted)" }}>
                            {formatUtcDate(invoice.issue_date)}
                          </td>
                          <td className="whitespace-nowrap py-3 px-2 font-semibold text-slate-900 font-mono-code sm:px-4">
                            {formatMoney(invoice.amount_minor, invoice.currency)}
                          </td>
                          <td className="whitespace-nowrap py-3 px-2 sm:px-4">
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
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
