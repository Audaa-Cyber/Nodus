import Link from "next/link";
import { redirect } from "next/navigation";
import { getBusinessContext } from "@/lib/auth/business-context";
import { effectiveStatus, formatMoney, formatUtcDate } from "@/lib/invoices";
import { formatUsdcBaseUnits } from "@/lib/payments/nodus-received-balance";
import { circleTestnetUsdcNetworks } from "@/lib/wallet/networks";
import MerchantUsdcBalance from "@/components/merchant-usdc-balance";
import CopyWalletAddressButton from "@/components/copy-wallet-address-button";
import { StatCounter } from "@/components/stat-counter";

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
  const [allInvoicesResult, recentInvoicesResult, recentSettlementsResult] = await Promise.all([
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
    supabase
      .from("payment_settlements")
      .select("id,invoice_id,outcome,destination_network,received_amount_base_units,created_at")
      .eq("business_id", business.id)
      .eq("outcome", "VERIFIED")
      .order("created_at", { ascending: false })
      .limit(5),
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
  const isConfigured = Boolean(business.receiving_address?.trim());

  // Resolve invoice numbers for verified settlements
  const verifiedSettlements = recentSettlementsResult.data ?? [];
  const knownInvoices = new Map(recentInvoicesResult.data?.map((inv) => [inv.id, inv.invoice_number]) ?? []);
  const missingInvoiceIds = verifiedSettlements
    .map((s) => s.invoice_id)
    .filter((id) => !knownInvoices.has(id));

  if (missingInvoiceIds.length > 0) {
    const { data: extraInvoices } = await supabase
      .from("invoices")
      .select("id,invoice_number")
      .in("id", missingInvoiceIds);
    extraInvoices?.forEach((inv) => knownInvoices.set(inv.id, inv.invoice_number));
  }

  return (
    <div className="w-full space-y-6 overview-page-container">
      {/* 1. Dashboard Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-5" style={{ borderColor: "var(--card-border)" }}>
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>
            BUSINESS OVERVIEW
          </span>
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Overview
            </h1>
            <span className="text-xs font-medium text-slate-500">
              · {business.business_name}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Real-time financial status, verified settlements, and invoice pipeline.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Link
            href="/dashboard/invoices"
            className="inline-flex items-center justify-center px-3.5 py-2 rounded-lg border text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:text-slate-900 transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] shadow-sm"
            style={{ borderColor: "var(--card-border)" }}
          >
            View invoices
          </Link>
          <Link
            href="/dashboard/invoices/new"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] shadow-sm"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M8 3v10M3 8h10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Create invoice</span>
          </Link>
        </div>
      </div>

      {/* 2. Top Financial Command Row: Balance & Receiving Destination */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: NODUS Received Balance Card */}
        <div className="lg:col-span-7 flex">
          <MerchantUsdcBalance initialSelectedNetwork={business.receiving_network} />
        </div>

        {/* Right: Active Receiving Destination Card */}
        <div className="lg:col-span-5 flex">
          <div className="surface-card w-full p-5 sm:p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: "var(--text-muted)" }}>
                    ACTIVE DESTINATION
                  </span>
                  <h3 className="break-words text-base font-bold text-slate-900 mt-1">
                    {business.business_name}
                  </h3>
                </div>
                <span
                  className="w-fit shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium text-slate-600"
                  style={{ borderColor: "var(--card-border)" }}
                >
                  {isConfigured ? "Address saved" : "Setup needed"}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-medium">Network:</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-medium capitalize">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500" aria-hidden="true" />
                  {(business.receiving_network || "base-sepolia").replaceAll("-", " ")}
                </span>
              </div>

              <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--card-border)" }}>
                <span className="text-[10px] font-semibold uppercase tracking-wider block mb-1.5" style={{ color: "var(--text-muted)" }}>
                  RECEIVING ADDRESS
                </span>
                {isConfigured && business.receiving_address ? (
                  <div className="flex min-w-0 items-center justify-between gap-2 p-2.5 rounded-md bg-slate-50/80 border" style={{ borderColor: "var(--card-border)" }}>
                    <span className="min-w-0 truncate font-mono-code text-xs text-slate-700" title={business.receiving_address}>
                      {shortenAddress(business.receiving_address)}
                    </span>
                    <CopyWalletAddressButton address={business.receiving_address} />
                  </div>
                ) : (
                  <div className="p-3 rounded-md bg-amber-50 border border-amber-200">
                    <p className="text-xs text-amber-800 font-medium">Receiving address not configured</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Customers cannot settle invoices until a receiving wallet address is set.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs" style={{ borderColor: "var(--card-border)" }}>
              <span className="text-[11px] text-slate-400">
                Direct settlement destination
              </span>
              <Link
                href="/dashboard/settings"
                className="font-medium text-slate-700 hover:text-slate-900 flex items-center gap-1 transition-colors group"
              >
                <span>Settings</span>
                <span aria-hidden="true" className="inline-block transition-transform duration-150 group-hover:translate-x-0.5">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Invoice Statistics Row (KPI Cards) */}
      <div>
        <div className="flex items-center justify-between mb-2.5 px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: "var(--text-muted)" }}>
            INVOICE STATISTICS
          </span>
          <span className="text-[11px] text-slate-400 font-mono-code">
            {today}
          </span>
        </div>

        {statError ? (
          <p className="text-xs text-rose-500" role="alert">
            Invoice summary could not be loaded.
          </p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Total Invoices */}
            <div className="surface-card p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Total invoices
                </span>
                <span className="w-2 h-2 rounded-full bg-slate-300" aria-hidden="true" />
              </div>
              <div className="mt-2">
                <StatCounter
                  value={totalCount}
                  className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-mono-code"
                />
                <span className="block text-[11px] text-slate-400 mt-0.5">
                  All created records
                </span>
              </div>
            </div>

            {/* Open Invoices */}
            <div className="surface-card p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Open invoices
                </span>
                <span className="w-2 h-2 rounded-full bg-blue-500" aria-hidden="true" />
              </div>
              <div className="mt-2">
                <StatCounter
                  value={openCount}
                  className="text-2xl sm:text-3xl font-bold tracking-tight text-blue-600 font-mono-code"
                />
                <span className="block text-[11px] text-slate-400 mt-0.5">
                  Awaiting payment
                </span>
              </div>
            </div>

            {/* Paid Invoices */}
            <div className="surface-card p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Paid invoices
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
              </div>
              <div className="mt-2">
                <StatCounter
                  value={paidCount}
                  className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-600 font-mono-code"
                />
                <span className="block text-[11px] text-slate-400 mt-0.5">
                  Verified settlements
                </span>
              </div>
            </div>

            {/* Overdue Invoices */}
            <div className="surface-card p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Overdue invoices
                </span>
                <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
              </div>
              <div className="mt-2">
                <StatCounter
                  value={overdueCount}
                  className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-600 font-mono-code"
                />
                <span className="block text-[11px] text-slate-400 mt-0.5">
                  Past due date
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Activity & Records Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Recent Invoices Table */}
        <div className="lg:col-span-7 space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent invoices</h2>
              <p className="text-[11px] text-slate-500">Latest issued and draft invoices</p>
            </div>
            <Link
              href="/dashboard/invoices"
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1 group"
            >
              <span>All invoices</span>
              <span aria-hidden="true" className="inline-block transition-transform duration-150 group-hover:translate-x-0.5">→</span>
            </Link>
          </div>

          <div className="surface-card overflow-hidden">
            {recentInvoicesResult.error ? (
              <p className="p-6 text-xs text-rose-500">Invoices could not be loaded.</p>
            ) : recentInvoicesResult.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "var(--card-border)" }}>
                      <th className="py-3 px-3 font-semibold text-slate-700 sm:px-4">Invoice</th>
                      <th className="hidden py-3 px-4 font-semibold text-slate-700 sm:table-cell">Issue date</th>
                      <th className="py-3 px-3 font-semibold text-slate-700 sm:px-4">Amount</th>
                      <th className="py-3 px-3 font-semibold text-slate-700 sm:px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: "var(--card-border)" }}>
                    {recentInvoicesResult.data.map((invoice) => {
                      const status = effectiveStatus(invoice, today);
                      return (
                        <tr key={invoice.id} className="hover:bg-slate-500/5 transition-colors duration-150 group">
                          <td className="min-w-0 py-3.5 px-3 font-medium sm:px-4">
                            <Link href={`/dashboard/invoices/${invoice.id}`} className="font-mono-code font-semibold text-slate-900 group-hover:text-blue-600 group-hover:underline transition-colors duration-150">
                              {invoice.invoice_number}
                            </Link>
                            <span className="mt-0.5 block text-[10px] text-slate-500 sm:hidden">
                              Issue date {formatUtcDate(invoice.issue_date)}
                            </span>
                          </td>
                          <td className="hidden py-3.5 px-4 font-mono-code text-[11px] text-slate-500 sm:table-cell">
                            {formatUtcDate(invoice.issue_date)}
                          </td>
                          <td className="whitespace-nowrap py-3.5 px-3 font-semibold text-slate-900 font-mono-code sm:px-4">
                            {formatMoney(invoice.amount_minor, invoice.currency)}
                          </td>
                          <td className="whitespace-nowrap py-3.5 px-3 sm:px-4 text-right">
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
              <div className="p-8 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">No invoices recorded yet</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Create an invoice to accept cross-chain USDC payments.
                  </p>
                </div>
                <div>
                  <Link
                    href="/dashboard/invoices/new"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-sm"
                  >
                    <span>Create invoice</span>
                    <span aria-hidden="true">↗</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Payment Activity / Verified Settlements */}
        <div className="lg:col-span-5 space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-slate-900">Verified settlements</h2>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  EVM
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Confirmed on-chain invoice payments</p>
            </div>
          </div>

          <div className="surface-card p-4 sm:p-5">
            {verifiedSettlements.length > 0 ? (
              <ul className="divide-y text-xs" style={{ borderColor: "var(--card-border)" }}>
                {verifiedSettlements.map((settlement) => {
                  const invoiceNumber = knownInvoices.get(settlement.invoice_id) || "Invoice";
                  const networkLabel = circleTestnetUsdcNetworks.find((n) => n.key === settlement.destination_network)?.label
                    ?? settlement.destination_network
                    ?? "EVM";
                  return (
                    <li key={settlement.id} className="py-2.5 px-2 -mx-2 rounded-md hover:bg-slate-500/5 transition-colors flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/invoices/${settlement.invoice_id}`}
                          className="font-mono-code font-semibold text-slate-900 hover:underline block truncate"
                        >
                          {invoiceNumber}
                        </Link>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                          <span className="text-slate-400">
                            {formatUtcDate(settlement.created_at)}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-600 font-medium capitalize">
                            {networkLabel}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono-code font-bold text-xs text-emerald-600 block">
                          +{formatUsdcBaseUnits(settlement.received_amount_base_units ?? "0")} USDC
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          Settled
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="py-7 text-center space-y-2">
                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">No verified settlements yet</p>
                  <p className="text-[11px] text-slate-400 max-w-[220px] mx-auto mt-0.5">
                    When customers pay via CCTP or direct transfer, confirmed settlements appear here.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
