import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const viewSource = await readFile(new URL("../src/components/paid-invoice-detail-view.tsx", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../src/app/dashboard/invoices/[id]/page.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("Section 1: Main paid invoice view displays top header, clear Paid status, prominent amount received, and verification banner", () => {
  // Invoice number & back link
  assert.ok(viewSource.includes("paid-invoice-number"), "has paid-invoice-number");
  assert.ok(viewSource.includes("#{invoice.invoice_number}"), "renders invoice number");
  assert.ok(viewSource.includes("← Back to invoices"), "has back link");

  // Clear Paid status
  assert.ok(viewSource.includes("paid-badge-prominent"), "has prominent paid badge");
  assert.ok(viewSource.includes("paid-badge-dot"), "has badge dot");
  assert.ok(viewSource.includes(">Paid</span>") || viewSource.includes("Paid"), "shows Paid status");

  // Prominent received amount
  assert.ok(viewSource.includes("paid-amount-label"), "has amount label");
  assert.ok(viewSource.includes("AMOUNT RECEIVED"), "AMOUNT RECEIVED label");
  assert.ok(viewSource.includes("paid-amount-figure"), "has amount figure");
  assert.ok(viewSource.includes("receivedDisplayAmount"), "displays receivedDisplayAmount");
  assert.ok(viewSource.includes("paid-amount-badge"), "has amount badge with network");

  // Short payment verification confirmation
  assert.ok(viewSource.includes("paid-verification-banner"), "has verification banner");
  assert.ok(viewSource.includes("Payment Verified On-Chain"), "shows Payment Verified On-Chain");
  assert.ok(viewSource.includes("Destination settlement independently confirmed"), "confirms destination settlement");
});

test("Section 2: Invoice details displays customer/business info, dates, items, subtotal, discount, and final amount", () => {
  // Customer & business info
  assert.ok(viewSource.includes("paid-party-grid"), "has party grid");
  assert.ok(viewSource.includes("BILLED BY"), "BILLED BY section");
  assert.ok(viewSource.includes("seller.business_name"), "shows seller business name");
  assert.ok(viewSource.includes("BILLED TO"), "BILLED TO section");
  assert.ok(viewSource.includes("invoice.customer_name"), "shows customer name");

  // Issue & due dates
  assert.ok(viewSource.includes("paid-dates-block"), "has dates block");
  assert.ok(viewSource.includes("formatUtcDate(invoice.issue_date)"), "formats issue date");
  assert.ok(viewSource.includes("invoice.due_date"), "checks due date");

  // Items & quantities
  assert.ok(viewSource.includes("paid-items-table"), "has items table");
  assert.ok(viewSource.includes("item.quantity"), "renders item quantity");
  assert.ok(viewSource.includes("formatMoney(item.unitPriceMinor"), "formats unit price");
  assert.ok(viewSource.includes("formatMoney(item.lineTotalMinor"), "formats line total");

  // Subtotal, Discount, and Final invoice amount
  assert.ok(viewSource.includes("paid-financials-card"), "has financials card");
  assert.ok(viewSource.includes("Subtotal"), "shows Subtotal");
  assert.ok(viewSource.includes("Discount"), "shows Discount");
  assert.ok(viewSource.includes("Final invoice amount"), "shows Final invoice amount");
  assert.ok(viewSource.includes("paid-total-value"), "has total value class");
});

test("Section 3: Payment summary provides dedicated clear section with 6 key confirmation fields", () => {
  assert.ok(viewSource.includes("paid-summary-grid"), "has payment summary grid");

  // 1. Receipt number
  assert.ok(viewSource.includes("Receipt number"), "shows receipt number label");
  assert.ok(viewSource.includes("#{receiptNumber}"), "displays receipt number");
  assert.ok(viewSource.includes('copyToClipboard(receiptNumber, "receipt")'), "has copy receipt button");

  // 2. Amount paid
  assert.ok(viewSource.includes("Amount paid"), "shows Amount paid");
  assert.ok(viewSource.includes("formatMoney(invoice.amount_minor, invoice.currency)"), "formats amount paid");

  // 3. Merchant received amount
  assert.ok(viewSource.includes("Merchant received amount"), "shows Merchant received amount");
  assert.ok(viewSource.includes("receivedDisplayAmount"), "shows receivedDisplayAmount");

  // 4. Destination asset & network
  assert.ok(viewSource.includes("Destination asset &amp; network"), "shows destination asset & network");
  assert.ok(viewSource.includes("{destinationAsset} on {destinationNetworkLabel}"), "interpolates asset & network");

  // 5. Payment date/time
  assert.ok(viewSource.includes("Payment date/time"), "shows Payment date/time");
  assert.ok(viewSource.includes("formatUtcDateTime(paymentDate)"), "formats payment date");

  // 6. Payment mode
  assert.ok(viewSource.includes("Payment mode"), "shows Payment mode");
  assert.ok(viewSource.includes("paid-mode-pill"), "has paid mode pill");
});

test("Section 4: NEAR reconciliation is kept visible as a separate section with status, explorer link, and timestamp", () => {
  assert.ok(viewSource.includes("near-reconciliation-title"), "has near-reconciliation-title");
  assert.ok(viewSource.includes("NEAR reconciliation"), "shows NEAR reconciliation title");
  assert.ok(viewSource.includes("paid-reconciliation-disclaimer"), "has disclaimer");
  assert.ok(viewSource.includes("Settlement on EVM destination chain is verified independently"), "separates EVM settlement from NEAR");

  // Statuses & explorer link
  assert.ok(viewSource.includes("nearblocks.io/txns"), "links to nearblocks");
  assert.ok(viewSource.includes("Reconciliation confirmed on NEAR"), "shows confirmed status");
  assert.ok(viewSource.includes("formatUtcDateTime(primaryNearEntry.submitted_at)"), "formats submitted timestamp");
});

test("Section 5: Expandable technical details is collapsed by default and preserves all existing payment evidence", () => {
  assert.ok(viewSource.includes('<details className="paid-tech-details-accordion">'), "uses collapsed details element");
  assert.ok(viewSource.includes("Technical payment details"), "has Technical payment details title");

  // Preserved technical fields
  assert.ok(viewSource.includes("Source asset"), "has source asset");
  assert.ok(viewSource.includes("Source network"), "has source network");
  assert.ok(viewSource.includes("Destination asset"), "has destination asset");
  assert.ok(viewSource.includes("Destination network"), "has destination network");
  assert.ok(viewSource.includes("Payer debit"), "has payer debit");
  assert.ok(viewSource.includes("Circle fees"), "has Circle fees");
  assert.ok(viewSource.includes("Payer wallet address"), "has payer wallet");
  assert.ok(viewSource.includes("Merchant wallet address"), "has merchant wallet");
  assert.ok(viewSource.includes("Source transaction"), "has source transaction");
  assert.ok(viewSource.includes("Destination transaction"), "has destination transaction");
  assert.ok(viewSource.includes("Settlement timestamp"), "has settlement timestamp");
  assert.ok(viewSource.includes("Settlement outcome"), "has settlement outcome");
});

test("Invoice detail page renders PaidInvoiceDetailView when invoice.status === 'paid'", () => {
  assert.ok(pageSource.includes('import { PaidInvoiceDetailView } from "@/components/paid-invoice-detail-view"'), "imports PaidInvoiceDetailView");
  assert.ok(pageSource.includes("if (isPaid) {"), "has if (isPaid) check");
  assert.ok(pageSource.includes("<PaidInvoiceDetailView"), "renders PaidInvoiceDetailView");
});

test("CSS stylesheet contains all receipt-inspired classes and print rules for the redesigned view", () => {
  assert.ok(styles.includes(".paid-invoice-view-wrapper"), "has .paid-invoice-view-wrapper");
  assert.ok(styles.includes(".paid-invoice-hero-card"), "has .paid-invoice-hero-card");
  assert.ok(styles.includes(".paid-invoice-amount-box"), "has .paid-invoice-amount-box");
  assert.ok(styles.includes(".paid-verification-banner"), "has .paid-verification-banner");
  assert.ok(styles.includes(".paid-invoice-card"), "has .paid-invoice-card");
  assert.ok(styles.includes(".paid-summary-grid"), "has .paid-summary-grid");
  assert.ok(styles.includes(".paid-tech-details-accordion"), "has .paid-tech-details-accordion");
  assert.ok(styles.includes(".paid-tech-details-accordion"), "has print rules");
});
