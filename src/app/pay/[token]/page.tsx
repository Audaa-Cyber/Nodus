import { createHash } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/invoices";
import { getWalletNetwork } from "@/lib/wallet/networks";
import { LazyInvoiceWalletCheckout } from "@/components/wallet/lazy-wallet-checkout";
import { withTransitionDelay } from "@/lib/utils/timing";

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

function formatNetworkLabel(networkKey: string | null): string {
  if (!networkKey) return "Arbitrum Sepolia";
  const known = getWalletNetwork(networkKey);
  if (known) return known.label;
  const lower = networkKey.trim().toLowerCase();
  if (lower.includes("arbitrum")) return "Arbitrum Sepolia";
  if (lower.includes("base")) return "Base Sepolia";
  return networkKey;
}

function shortAddress(address: string | null): string {
  if (!address) return "Unavailable";
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

function formatBaseUnits(amount: string | null, decimals: number | null) {
  if (!amount || !/^\d+$/.test(amount) || !Number.isInteger(decimals) || decimals === null || decimals < 0 || decimals > 30) return "Amount unavailable";
  if (decimals === 0) return amount;
  const padded = amount.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!PUBLIC_TOKEN_PATTERN.test(token)) return unavailablePage("This link is unavailable", "Check that the invoice link is correct, or ask the business for a new one.", "invalid");

  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, contextResult] = await withTransitionDelay(
    Promise.all([
      supabase.rpc("lookup_shared_invoice", { p_token_hash: tokenHash }),
      supabase.rpc("lookup_shared_payment_context", { p_token_hash: tokenHash }),
    ]),
    700
  );
  if (error) return unavailablePage("Invoice details are temporarily unavailable", "We couldn't load this invoice right now.", "error");
  const invoice = data?.[0];
  if (!invoice) return unavailablePage("This link is unavailable", "It may have been revoked or may not be valid. Ask the business for a current invoice link.", "invalid");
  if (invoice.link_status === "expired") return unavailablePage("This link has expired", "Ask the business to generate a new invoice link.", "expired");
  if (!invoice.business_name || !invoice.invoice_number || !invoice.description || invoice.amount_minor === null || !invoice.currency || !invoice.issue_date || !invoice.status) {
    return unavailablePage("Invoice details are temporarily unavailable", "We couldn't load this invoice right now.", "error");
  }

  const paymentContext = contextResult?.data?.[0] ?? null;
  const destinationNetwork = paymentContext?.receiving_network ?? null;
  const recipientAddress = paymentContext?.receiving_address ?? null;
  const { data: receipts } = await supabase.rpc("lookup_shared_payment_receipts", { p_token_hash: tokenHash });

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
    <dl className="public-invoice-dates">
      <div><dt>Issued</dt><dd>{displayDate(invoice.issue_date)}</dd></div>
      {invoice.due_date && <div><dt>Due</dt><dd>{displayDate(invoice.due_date)}</dd></div>}
      {destinationNetwork && (
        <div>
          <dt>Settlement network</dt>
          <dd>{formatNetworkLabel(destinationNetwork)}</dd>
        </div>
      )}
      {recipientAddress && (
        <div>
          <dt>Merchant recipient</dt>
          <dd title={recipientAddress}>
            <code>{shortAddress(recipientAddress)}</code>
          </dd>
        </div>
      )}
    </dl>
    <p className={`public-invoice-status public-status-${status}`} role="status">{statusMessage}</p>
    {receipts && receipts.length > 0 && <section className="public-invoice-description" aria-labelledby="payment-receipt-title"><h2 id="payment-receipt-title">Payment receipt</h2><ul>{receipts.map((receipt) => {
      const outcome = receipt.outcome === "VERIFIED" ? "Verified settlement"
        : receipt.outcome === "PARTIAL" ? "Verified partial payment"
          : receipt.outcome === "OVERPAID" ? "Verified payment; overpayment review required"
            : "Payment received; reconciliation review required";
      const hashes = Array.isArray(receipt.destination_tx_hashes) ? receipt.destination_tx_hashes.filter((hash): hash is string => typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash)) : [];
      return <li key={receipt.receipt_number}><strong>{receipt.receipt_number}</strong><p>{outcome}</p><p>{formatBaseUnits(receipt.received_amount_base_units, receipt.received_asset_decimals)} {receipt.destination_asset_id ?? "asset"} on {receipt.destination_network ?? "network"}</p>{hashes.map((hash) => <p key={hash}>Destination transaction: <code>{hash}</code></p>)}</li>;
    })}</ul><p className="public-invoice-note">This receipt reflects payment verification and is not a separate invoice.</p></section>}
    {(status === "open" || status === "overdue") ? (
      <LazyInvoiceWalletCheckout
        shareToken={token}
        invoiceNumber={invoice.invoice_number}
        amountMinor={invoice.amount_minor}
        currency={invoice.currency}
        status={status}
        destinationNetwork={destinationNetwork}
        recipientAddress={recipientAddress}
      />
    ) : (
      <p className="public-invoice-note">Wallet setup is unavailable for this invoice. No payment can be prepared.</p>
    )}
    <p className="public-invoice-note">Wallet connection is optional and does not authorize payment.</p>
  </article></main>;
}
