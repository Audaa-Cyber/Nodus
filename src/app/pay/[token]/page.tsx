import { createHash } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/invoices";
import { parseInvoiceItems, settlementContract } from "@/lib/invoice-design";
import { getWalletNetwork } from "@/lib/wallet/networks";
import { PayerInvoiceFrame } from "@/components/payer-invoice-frame";
import { PayerInvoiceSheet } from "@/components/payer-invoice-sheet";
import { PaymentSuccessCard, type LineItem } from "@/components/payment-success-card";

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
  const [{ data, error }, contextResult, partyResult] = await Promise.all([
    supabase.rpc("lookup_shared_invoice", { p_token_hash: tokenHash }),
    supabase.rpc("lookup_shared_payment_context", { p_token_hash: tokenHash }),
    supabase.rpc("lookup_shared_invoice_parties", { p_token_hash: tokenHash }),
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
  const destinationNetwork = paymentContext?.receiving_network ?? null;
  const recipientAddress = paymentContext?.receiving_address ?? null;
  const { data: receipts } = await supabase.rpc("lookup_shared_payment_receipts", { p_token_hash: tokenHash });

  const status = invoice.status;
  const parties = partyResult.data?.[0] ?? null;
  const sellerDetails = { email: sellerEmail, phone: sellerPhone, address: sellerAddress,
    website: sellerWebsite, taxId: sellerTaxId,
    founderName: typeof seller.founder_name === "string" ? seller.founder_name : null,
    founderTitle: typeof seller.founder_title === "string" ? seller.founder_title : null,
    reviewUrl: typeof seller.review_url === "string" ? seller.review_url : null };

  if (status === "paid") {
    const { data: receiptDestinations } = await supabase.rpc("lookup_shared_receipt_destinations", { p_token_hash: tokenHash });
    const historicalRecipients = new Map(receiptDestinations?.map(entry => [entry.receipt_number, entry.recipient_address]) ?? []);
    const receiptDetails = receipts?.map(entry => ({ ...entry, recipient_address: historicalRecipients.get(entry.receipt_number) ?? null })) ?? [];
    return (
      <main>
        <PaymentSuccessCard
          shareToken={token}
          invoiceNumber={invoice.invoice_number}
          amountMinor={invoice.amount_minor}
          currency={invoice.currency}
          businessName={sellerName}
          logoUrl={sellerLogo}
          issueDate={invoice.issue_date}
          dueDate={invoice.due_date}
          destinationNetwork={destinationNetwork}
          recipientAddress={receiptDetails[0]?.recipient_address ?? null}
          receipt={receiptDetails[0] ?? null}
          receipts={receiptDetails}
          lineItems={Array.isArray(invoice.line_items) ? (invoice.line_items as unknown as LineItem[]) : null}
          subtotalMinor={invoice.subtotal_minor}
          taxRateBps={invoice.tax_rate_bps}
          discountMinor={invoice.discount_minor}
          sellerFooter={typeof seller.invoice_footer === "string" ? seller.invoice_footer : invoice.invoice_footer}
          sellerDetails={sellerDetails}
        />
      </main>
    );
  }
  const statusMessage = (status as string) === "paid"
    ? "This invoice has already been paid."
    : status === "cancelled"
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
  const escrowContract = shortAddress(settlementContract(null));
  const checkout = (status === "open" || status === "overdue") ? {
    shareToken: token, invoiceNumber: invoice.invoice_number, amountMinor: invoice.amount_minor,
    currency: invoice.currency, status, destinationNetwork, recipientAddress,
    businessName: sellerName, logoUrl: sellerLogo, issueDate: invoice.issue_date, dueDate: invoice.due_date,
    sellerFooter: typeof seller.invoice_footer === "string" ? seller.invoice_footer : invoice.invoice_footer,
    lineItems: items, subtotalMinor, taxRateBps: invoice.tax_rate_bps, discountMinor: invoice.discount_minor, sellerDetails,
  } : null;

  return <PayerInvoiceFrame checkout={checkout}>
    <PayerInvoiceSheet
      invoiceNumber={invoice.invoice_number} status={status} businessName={sellerName} logoUrl={sellerLogo}
      email={sellerEmail} phone={sellerPhone} address={sellerAddress} taxId={sellerTaxId}
      customerName={parties?.customer_name} customerEmail={parties?.customer_email}
      customerCompany={parties?.customer_company} customerPhone={parties?.customer_phone} customerAddress={parties?.customer_address}
      amount={safeFormatMoney(invoice.amount_minor, invoice.currency)} subtotal={safeFormatMoney(subtotalMinor, invoice.currency)}
      tax={safeFormatMoney(Math.round(subtotalMinor * (invoice.tax_rate_bps ?? 0) / 10000), invoice.currency)}
      taxPercent={((invoice.tax_rate_bps ?? 0) / 100).toString()} discount={safeFormatMoney(invoice.discount_minor ?? 0, invoice.currency)}
      issueDate={displayDate(invoice.issue_date)} dueDate={invoice.due_date ? displayDate(invoice.due_date) : "—"}
      network={destinationNetwork ? formatNetworkLabel(destinationNetwork) : "Unavailable"} recipient={shortAddress(recipientAddress)}
      escrowContract={escrowContract} signature={sellerDetails.founderName} signatureTitle={sellerDetails.founderTitle}
      items={items.map((item) => ({ ...item, price: safeFormatMoney(item.unitPriceMinor, invoice.currency!), total: safeFormatMoney(item.lineTotalMinor, invoice.currency!) }))}
    />
    {status !== "open" && <p className={`public-invoice-status public-status-${status}`} role="status">{statusMessage}</p>}
    {receipts && receipts.length > 0 && <section className="done" aria-labelledby="payment-receipt-title">
      <h2 id="payment-receipt-title">Payment receipt</h2><ul>{receipts.map((receipt) => {
        const outcome = receipt.outcome === "VERIFIED" ? "Verified settlement"
          : receipt.outcome === "PARTIAL" ? "Verified partial payment"
            : receipt.outcome === "OVERPAID" ? "Verified payment; overpayment review required"
              : "Payment received; reconciliation review required";
        const hashes = Array.isArray(receipt.destination_tx_hashes)
          ? receipt.destination_tx_hashes.filter((hash): hash is string => typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash)) : [];
        return <li key={receipt.receipt_number}><strong>{receipt.receipt_number}</strong><p>{outcome}</p>
          <p>{formatBaseUnits(receipt.received_amount_base_units, receipt.received_asset_decimals)} {receipt.destination_asset_id ?? "asset"} on {receipt.destination_network ?? "network"}</p>
          {hashes.map((hash) => <p key={hash}>Destination transaction: <code>{hash}</code></p>)}
        </li>;
      })}</ul><p>This receipt reflects payment verification and is not a separate invoice.</p>
    </section>}
    {!checkout && <p className="public-invoice-note">Wallet setup is unavailable for this invoice. No payment can be prepared.</p>}
  </PayerInvoiceFrame>;
}
