import { createHash } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/invoices";
import { InvoiceWalletCheckout } from "@/components/wallet/invoice-wallet-checkout";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Invoice | Nodus",
  robots: { index: false, follow: false },
};

const PUBLIC_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function unavailablePage(title: string, message: string, state: "invalid" | "expired" | "error") {
  return <main className="public-invoice-page"><section className="public-invoice-card public-invoice-state" aria-labelledby="public-state-title">
    <Link className="public-brand" href="/" aria-label="Nodus home">nodus<span>.</span></Link>
    <p className="eyebrow">INVOICE ACCESS</p><h1 id="public-state-title">{title}</h1><p>{message}</p>
    {state === "error" && <p className="public-state-note" role="alert">Please try again in a few minutes.</p>}
  </section></main>;
}

function displayDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" });
}

function safeFormatMoney(amountMinor: number, currency: string) {
  try {
    return formatMoney(amountMinor, currency);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!PUBLIC_TOKEN_PATTERN.test(token)) return unavailablePage("This link is unavailable", "Check that the invoice link is correct, or ask the business for a new one.", "invalid");

  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("lookup_shared_invoice", { p_token_hash: tokenHash });
  if (error) return unavailablePage("Invoice details are temporarily unavailable", "We couldn't load this invoice right now.", "error");
  const invoice = data?.[0];
  if (!invoice) return unavailablePage("This link is unavailable", "It may have been revoked or may not be valid. Ask the business for a current invoice link.", "invalid");
  if (invoice.link_status === "expired") return unavailablePage("This link has expired", "Ask the business to generate a new invoice link.", "expired");
  if (!invoice.business_name || !invoice.invoice_number || !invoice.description || invoice.amount_minor === null || !invoice.currency || !invoice.issue_date || !invoice.status) {
    return unavailablePage("Invoice details are temporarily unavailable", "We couldn't load this invoice right now.", "error");
  }

  const status = invoice.status;
  const statusMessage = status === "paid"
    ? "This invoice has already been paid."
    : status === "cancelled"
      ? "This invoice has been cancelled and is no longer payable."
      : status === "overdue"
        ? "The due date has passed. Contact the business if you need help with this invoice."
        : status === "open"
          ? "This invoice is open. Contact the business with any questions."
          : "This invoice is not available for payment.";

  return <main className="public-invoice-page"><article className="public-invoice-card" aria-labelledby="public-invoice-title">
    <header className="public-invoice-header"><Link className="public-brand" href="/" aria-label="Nodus home">nodus<span>.</span></Link><span className={`status status-${status}`}>{status}</span></header>
    <p className="eyebrow">INVOICE FROM {invoice.business_name.toLocaleUpperCase()}</p>
    <h1 id="public-invoice-title">Invoice {invoice.invoice_number}</h1>
    <p className="public-invoice-business">{invoice.business_name}</p>
    <div className="public-invoice-amount"><span>INVOICE TOTAL</span><strong>{safeFormatMoney(invoice.amount_minor, invoice.currency)}</strong></div>
    <section className="public-invoice-description" aria-label="Invoice description"><h2>Description</h2><p>{invoice.description}</p></section>
    <dl className="public-invoice-dates"><div><dt>Issued</dt><dd>{displayDate(invoice.issue_date)}</dd></div>{invoice.due_date && <div><dt>Due</dt><dd>{displayDate(invoice.due_date)}</dd></div>}</dl>
    <p className={`public-invoice-status public-status-${status}`} role="status">{statusMessage}</p>
    {(status === "open" || status === "overdue") ? (
      <InvoiceWalletCheckout
        shareToken={token}
        invoiceNumber={invoice.invoice_number}
        amountMinor={invoice.amount_minor}
        currency={invoice.currency}
        status={status}
      />
    ) : (
      <p className="public-invoice-note">Wallet setup is unavailable for this invoice. No payment can be prepared.</p>
    )}
    <p className="public-invoice-note">Wallet connection is optional and does not authorize payment.</p>
  </article></main>;
}
