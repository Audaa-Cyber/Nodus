import { createHash } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/invoices";
import { parseInvoiceItems } from "@/lib/invoice-design";
import { getWalletNetwork } from "@/lib/wallet/networks";
import { PayerInvoiceFrame } from "@/components/payer-invoice-frame";
import { PayerInvoiceSheet } from "@/components/payer-invoice-sheet";
import type { LineItem } from "@/components/payment-success-card";

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
  const [{ data, error }, contextResult, partyResult, paymentOptionsResult] = await Promise.all([
    supabase.rpc("lookup_shared_invoice", { p_token_hash: tokenHash }),
    supabase.rpc("lookup_shared_payment_context", { p_token_hash: tokenHash }),
    supabase.rpc("lookup_shared_invoice_parties", { p_token_hash: tokenHash }),
    supabase.rpc("lookup_shared_payment_networks", { p_token_hash: tokenHash }),
  ]);
  if (error) return unavailablePage("Invoice details are temporarily unavailable", "We couldn't load this invoice right now.", "error");
  const invoice = data?.[0];
  if (!invoice) return unavailablePage("This link is unavailable", "It may have been revoked or may not be valid. Ask the business for a current invoice link.", "invalid");
  if (invoice.link_status === "expired") return unavailablePage("This link has expired", "Ask the business to generate a new invoice link.", "expired");
  if (!invoice.business_name || !invoice.invoice_number || !invoice.description || invoice.amount_minor === null || !invoice.currency || !invoice.issue_date || !invoice.status) {
    return unavailablePage("Invoice details are temporarily unavailable", "We couldn't load this invoice right now.", "error");
  }

  const seller = invoice.seller_snapshot && typeof invoice.seller_snapshot === "object" && !Array.isArray(invoice.seller_snapshot) ? invoice.seller_snapshot as Record<string, unknown> : {};
  const sellerName = typeof seller.business_name === "string" ? seller.business_name : invoice.business_name;
  const sellerEmail = typeof seller.email === "string" ? seller.email : null;
  const sellerPhone = typeof seller.business_phone === "string" ? seller.business_phone : null;
  const sellerAddress = typeof seller.business_address === "string" ? seller.business_address : null;
  const sellerWebsite = typeof seller.website_url === "string" ? seller.website_url : null;
  const sellerTaxId = typeof seller.tax_registration_number === "string" ? seller.tax_registration_number : null;
  const sellerLogo = typeof seller.logo_url === "string" ? seller.logo_url : invoice.logo_url;
  const paymentContext = contextResult?.data?.[0] ?? null;
  const paymentOptions = paymentOptionsResult?.data?.[0] ?? null;
  const destinationNetworks = Array.isArray(paymentOptions?.receiving_networks) ? paymentOptions.receiving_networks : [];
  const destinationNetwork = destinationNetworks[0] ?? paymentContext?.receiving_network ?? null;
  const recipientAddress = paymentOptions?.receiving_address ?? paymentContext?.receiving_address ?? null;
  const { data: receipts } = await supabase.rpc("lookup_shared_payment_receipts", { p_token_hash: tokenHash });

  const status = invoice.status;
  const parties = partyResult.data?.[0] ?? null;
  const sellerDetails = { email: sellerEmail, phone: sellerPhone, address: sellerAddress,
    website: sellerWebsite, taxId: sellerTaxId,
    founderName: typeof seller.founder_name === "string" ? seller.founder_name : null,
    founderTitle: typeof seller.founder_title === "string" ? seller.founder_title : null,
    reviewUrl: typeof seller.review_url === "string" ? seller.review_url : null };

  const statusMessage = status === "cancelled"
      ? "This invoice has been cancelled and is no longer payable."
      : status === "overdue"
        ? "The due date has passed. Contact the business if you need help with this invoice."
        : status === "open"
          ? "This invoice is open. Contact the business with any questions."
          : "This invoice is not available for payment.";

  const lineItems = parseInvoiceItems(invoice.line_items);
  const items = lineItems.length ? lineItems : [{ description: invoice.description, quantity: 1,
    unitPriceMinor: invoice.subtotal_minor ?? invoice.amount_minor,
    lineTotalMinor: invoice.subtotal_minor ?? invoice.amount_minor }];
  const subtotalMinor = invoice.subtotal_minor ?? invoice.amount_minor;
  const checkout = (status === "open" || status === "overdue") ? {
    shareToken: token, invoiceNumber: invoice.invoice_number, amountMinor: invoice.amount_minor,
    currency: invoice.currency, status, destinationNetwork, destinationNetworks, recipientAddress,
    businessName: sellerName, logoUrl: sellerLogo, issueDate: invoice.issue_date, dueDate: invoice.due_date,
    sellerFooter: typeof seller.invoice_footer === "string" ? seller.invoice_footer : invoice.invoice_footer,
    lineItems: items, subtotalMinor, taxRateBps: invoice.tax_rate_bps, discountMinor: invoice.discount_minor, sellerDetails,
  } : null;

  return <PayerInvoiceFrame checkout={checkout} isPaid={status === "paid"} shareToken={token} paidAt={receipts?.[0]?.issued_at ?? null}>
    <PayerInvoiceSheet
      invoiceNumber={invoice.invoice_number} status={status} businessName={sellerName} logoUrl={sellerLogo}
      email={sellerEmail} phone={sellerPhone} address={sellerAddress} taxId={sellerTaxId}
      customerName={parties?.customer_name} customerEmail={parties?.customer_email}
      customerCompany={parties?.customer_company} customerPhone={parties?.customer_phone} customerAddress={parties?.customer_address}
      currency={invoice.currency} amount={safeFormatMoney(invoice.amount_minor, invoice.currency)} subtotal={safeFormatMoney(subtotalMinor, invoice.currency)}
      tax={safeFormatMoney(Math.round(subtotalMinor * (invoice.tax_rate_bps ?? 0) / 10000), invoice.currency)}
      taxPercent={((invoice.tax_rate_bps ?? 0) / 100).toString()} discount={safeFormatMoney(invoice.discount_minor ?? 0, invoice.currency)} discountMinor={invoice.discount_minor}
      issueDate={displayDate(invoice.issue_date)} dueDate={invoice.due_date ? displayDate(invoice.due_date) : "—"}
      network={destinationNetwork ? formatNetworkLabel(destinationNetwork) : "Unavailable"} recipient={shortAddress(recipientAddress)}
      signature={sellerDetails.founderName} signatureTitle={sellerDetails.founderTitle}
      items={items.map((item) => ({ ...item, price: safeFormatMoney(item.unitPriceMinor, invoice.currency!), total: safeFormatMoney(item.lineTotalMinor, invoice.currency!) }))}
    />
    {status !== "open" && status !== "paid" && <p className={`public-invoice-status public-status-${status}`} role="status">{statusMessage}</p>}
    {!checkout && status !== "paid" && <p className="public-invoice-note">Wallet setup is unavailable for this invoice. No payment can be prepared.</p>}
  </PayerInvoiceFrame>;
}
