import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CancelInvoiceForm from "@/components/cancel-invoice-form";
import InvoiceSharePanel from "@/components/invoice-share-panel";
import { getBusinessContext } from "@/lib/auth/business-context";
import { effectiveStatus, formatMoney } from "@/lib/invoices";

function formatUtcDate(dateString: string): string {
  try {
    const iso = dateString.includes("T") ? dateString : `${dateString}T00:00:00Z`;
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));
  } catch {
    return dateString;
  }
}

function formatUtcDateTime(dateString: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(dateString)) + " UTC";
  } catch {
    return dateString;
  }
}

function formatBaseUnits(amount: string | null, decimals: number | null): string {
  if (!amount || !/^\d+$/.test(amount) || !Number.isInteger(decimals) || decimals === null || decimals < 0 || decimals > 30) return "Amount unavailable";
  if (decimals === 0) return amount;
  const padded = amount.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export default async function InvoiceDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cancelled?: string; error?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();
  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login");
  if (!business) notFound();
  const { data: invoice, error } = await supabase.from("invoices").select("*").eq("id", id).eq("business_id", business.id).maybeSingle();
  if (error || !invoice) notFound();
  const { data: receipts } = await supabase.from("payment_receipts").select("receipt_number,issued_at,payment_attempt_id")
    .eq("invoice_id", id).eq("business_id", business.id).order("issued_at", { ascending: false });
  const { data: settlements } = await supabase.from("payment_settlements")
    .select("payment_attempt_id,outcome,destination_asset_id,destination_network,received_amount_base_units,received_asset_decimals,destination_tx_hashes")
    .eq("invoice_id", id).eq("business_id", business.id);
  const status = effectiveStatus(invoice);
  const shareState = !invoice.share_token_hash
    ? "none"
    : invoice.share_token_expires_at && new Date(invoice.share_token_expires_at).getTime() > Date.now()
      ? "active"
      : "expired";
  const canEdit = status === "draft" || status === "open" || status === "overdue";
  const canCancel = canEdit;
  return <main className="dashboard-content narrow-content">
    <Link className="back-link" href="/dashboard/invoices">← Back to invoices</Link>
    <header className="detail-heading"><div><p className="eyebrow">INVOICE · {invoice.invoice_number}</p><h1>{invoice.customer_name}</h1><span className={`status status-${status}`}>{status}</span></div><div className="detail-actions">{canEdit && <Link className="button button-outline" href={`/dashboard/invoices/${id}/edit`}>Edit invoice</Link>}</div></header>
    {query.cancelled && <p className="form-success" role="status">Invoice cancelled. It can no longer be payable.</p>}{query.error && <p className="form-error" role="alert">Invoice could not be cancelled.</p>}
    <section className="invoice-detail-sheet"><div className="detail-amount"><span>AMOUNT DUE</span><strong>{formatMoney(invoice.amount_minor, invoice.currency)}</strong></div><dl><div><dt>From</dt><dd>{business.business_name}</dd></div><div><dt>Customer</dt><dd>{invoice.customer_name}{invoice.customer_email && <span>{invoice.customer_email}</span>}</dd></div><div><dt>Description</dt><dd>{invoice.description}</dd></div><div><dt>Issue date</dt><dd>{formatUtcDate(invoice.issue_date)}</dd></div><div><dt>Due date</dt><dd>{invoice.due_date ? formatUtcDate(invoice.due_date) : "Not set"}</dd></div><div><dt>Created</dt><dd>{formatUtcDateTime(invoice.created_at)}</dd></div><div><dt>Updated</dt><dd>{formatUtcDateTime(invoice.updated_at)}</dd></div></dl></section>
    <InvoiceSharePanel invoiceId={id} shareState={shareState} expiresAt={invoice.share_token_expires_at} canShare={invoice.status !== "draft"} />
    {receipts && receipts.length > 0 && <section className="invoice-detail-sheet" aria-labelledby="payment-history-title"><h2 id="payment-history-title">Payment receipts</h2><ul>{receipts.map((receipt) => {
      const settlement = settlements?.find((entry) => entry.payment_attempt_id === receipt.payment_attempt_id);
      const hashes = Array.isArray(settlement?.destination_tx_hashes) ? settlement.destination_tx_hashes.filter((hash): hash is string => typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash)) : [];
      return <li key={receipt.payment_attempt_id}><strong>{receipt.receipt_number}</strong> · {formatUtcDateTime(receipt.issued_at)}{settlement && <><p>{settlement.outcome.replaceAll("_", " ")}: {formatBaseUnits(settlement.received_amount_base_units, settlement.received_asset_decimals)} {settlement.destination_asset_id ?? "asset"} on {settlement.destination_network ?? "network"}</p>{hashes.map((hash) => <p key={hash}>Destination transaction: <code>{hash}</code></p>)}</>}</li>;
    })}</ul></section>}
    {canCancel && <section className="cancel-panel"><div><h2>Cancel invoice</h2><p>Cancelled invoices cannot be reopened and will not be payable.</p></div><CancelInvoiceForm invoiceId={id} /></section>}
    {invoice.status === "paid" && <p className="form-help">Paid status is recorded only after verified settlement.</p>}
  </main>;
}
