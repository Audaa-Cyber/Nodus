import Link from "next/link";
import { ArrowRight, Ban, Check, CircleCheck, Clock3, FilePenLine, FileText, Plus, TriangleAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { getBusinessContext } from "@/lib/auth/business-context";
import { getInvoiceSummary } from "@/lib/dashboard/invoice-summary";
import MerchantUsdcBalance from "@/components/merchant-usdc-balance";
import CopyWalletAddressButton from "@/components/copy-wallet-address-button";
import { StatCounter } from "@/components/stat-counter";
import { MetricPercentageBadge } from "@/components/metric-percentage-badge";
import { NetworkLogo } from "@/components/network-logo";
import { circleTestnetUsdcNetworks } from "@/lib/wallet/networks";
import { OverviewRecentInvoices } from "@/components/overview-recent-invoices";
import { OverviewSettlementActivity } from "@/components/overview-settlement-activity";

function shortenAddress(address: string) {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

export default async function DashboardPage() {
  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login");
  if (!business) {
    return (
      <div className="w-full max-w-[650px] mx-auto py-12">
        <div className="surface-card p-6 sm:p-8 rounded-xl border border-slate-200/90 bg-white shadow-sm">
          <h1 className="text-xl font-bold mb-2 text-slate-900">Business profile unavailable</h1>
          <p className="text-xs text-slate-500">
            Apply the Supabase migration to finish setting up your business account.
          </p>
        </div>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const [summary, recentInvoicesResult, recentSettlementsResult] = await Promise.all([
    getInvoiceSummary(supabase, business.id, today),
    supabase
      .from("invoices")
      .select("id,invoice_number,amount_minor,currency,status,due_date,issue_date,created_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(4),
    supabase
      .from("payment_settlements")
      .select("id,invoice_id,outcome,destination_network,destination_asset_id,received_amount_base_units,received_asset_decimals,created_at")
      .eq("business_id", business.id)
      .eq("outcome", "VERIFIED")
      .eq("provider_status", "SUCCESS")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const isConfigured = Boolean(business.receiving_network && business.receiving_address?.trim());
  const receivingNetworkLabel = circleTestnetUsdcNetworks.find((network) => network.key === business.receiving_network)?.label
    ?? business.receiving_network?.replaceAll("-", " ")
    ?? "Not configured";
  const recentInvoices = recentInvoicesResult.data ?? [];
  const verifiedSettlements = recentSettlementsResult.error ? null : recentSettlementsResult.data ?? [];
  const invoiceNumbers = new Map(recentInvoices.map((invoice) => [invoice.id, invoice.invoice_number]));
  const missingIds = [...new Set(verifiedSettlements?.map((entry) => entry.invoice_id).filter((id) => !invoiceNumbers.has(id)) ?? [])];
  if (missingIds.length) {
    const { data } = await supabase.from("invoices").select("id,invoice_number")
      .eq("business_id", business.id).in("id", missingIds);
    data?.forEach((invoice) => invoiceNumbers.set(invoice.id, invoice.invoice_number));
  }

  const totalInvoices = summary?.total ?? 0;
  const calculatePercentage = (val: number) => totalInvoices > 0 ? Math.round((val / totalInvoices) * 100) : 0;

  const metrics = summary ? [
    { label: "Total invoices", value: summary.total, percentage: totalInvoices > 0 ? 100 : 0, Icon: FileText, tone: "neutral" },
    { label: "Paid invoices", value: summary.paid, percentage: calculatePercentage(summary.paid), Icon: CircleCheck, tone: "paid" },
    { label: "Open invoices", value: summary.open, percentage: calculatePercentage(summary.open), Icon: Clock3, tone: "open" },
    { label: "Overdue invoices", value: summary.overdue, percentage: calculatePercentage(summary.overdue), Icon: TriangleAlert, tone: "overdue" },
    { label: "Cancelled invoices", value: summary.cancelled, percentage: calculatePercentage(summary.cancelled), Icon: Ban, tone: "cancelled" },
    { label: "Draft invoices", value: summary.draft, percentage: calculatePercentage(summary.draft), Icon: FilePenLine, tone: "neutral" },
  ] : [];

  return (
    <div className="overview-page-container">
      <div className="overview-heading">
        <div>
          <p className="overview-greeting">Welcome back,</p>
          <h1>Overview</h1>
          <p className="overview-subtitle">Track your payments and business activity.</p>
        </div>
        <Link href="/dashboard/invoices/new" className="overview-create">
          <Plus size={16} aria-hidden="true" /> Create Invoice
        </Link>
      </div>

      <div className="overview-financial-grid">
        <MerchantUsdcBalance />
        <div className="overview-metrics" aria-label="Invoice statistics">
          {!summary ? (
            <p className="overview-card overview-error" role="alert">Invoice statistics could not be loaded. Refresh the page to try again.</p>
          ) : metrics.map(({ label, value, percentage, Icon, tone }) => (
            <div className={`overview-card overview-metric overview-tone-${tone}`} key={label} role="group" aria-label={label}>
              <div className="overview-metric-top">
                <span className="overview-metric-icon"><Icon size={17} strokeWidth={1.7} aria-hidden="true" /></span>
                <MetricPercentageBadge percentage={percentage} label={label} tone={tone} />
              </div>
              <p aria-hidden="true">{label}</p>
              <div className="overview-metric-bottom">
                <StatCounter value={value} className="overview-metric-value" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overview-details-grid">
        <section className="overview-card overview-invoices" aria-labelledby="recent-invoices-title">
          <div className="overview-section-heading">
            <h2 id="recent-invoices-title">Recent Invoices</h2>
            <Link href="/dashboard/invoices" className="overview-text-link">View all <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <OverviewRecentInvoices key={business.id} invoices={recentInvoicesResult.error ? null : recentInvoices} today={today} />
        </section>

        <section className="overview-card overview-network" aria-labelledby="receiving-network-title">
          <div className="overview-section-heading">
            <h2 id="receiving-network-title">Receiving Network</h2>
            <span className={`overview-status ${isConfigured ? "overview-status-paid" : "overview-status-overdue"}`}><span aria-hidden="true" />{isConfigured ? "Configured" : "Setup needed"}</span>
          </div>
          <div className="overview-network-body">
            <div className="overview-network-identity">
              <span className="overview-network-icon"><NetworkLogo networkKey={business.receiving_network} size="md" /></span>
              <div><p>Receiving on</p><h3>{receivingNetworkLabel}</h3></div>
            </div>
            <p className="overview-address-label">Receiving address</p>
            {business.receiving_address?.trim() ? (
              <div className="overview-address">
                <span title={business.receiving_address}>{shortenAddress(business.receiving_address)}</span>
                <CopyWalletAddressButton address={business.receiving_address} />
              </div>
            ) : (
              <p className="overview-setup-message">Configure a receiving address in settings to accept payments.</p>
            )}
          </div>
          <div className="overview-network-footer">
            <span>Settlement destination</span>
            <Link href="/dashboard/settings" className="overview-text-link">View settings <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
        </section>
      </div>

      <OverviewSettlementActivity key={business.id} settlements={verifiedSettlements?.map((entry) => ({
        ...entry, invoiceNumber: invoiceNumbers.get(entry.invoice_id) ?? "Invoice",
      })) ?? null} />

      <div className="overview-verification">
        <span className="overview-verification-icon"><Check size={18} aria-hidden="true" /></span>
        <div><h2>Verified destination settlements <span className="overview-verification-dot" aria-hidden="true" /></h2>
          <p>An invoice is marked paid only after its destination USDC settlement is independently verified.</p>
        </div>
      </div>
    </div>
  );
}
