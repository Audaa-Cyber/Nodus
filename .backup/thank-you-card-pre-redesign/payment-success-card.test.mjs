import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const successCardSource = await readFile(new URL("../src/components/payment-success-card.tsx", import.meta.url), "utf8");
const invoicePageSource = await readFile(new URL("../src/app/pay/[token]/page.tsx", import.meta.url), "utf8");
const checkoutSource = await readFile(new URL("../src/components/wallet/invoice-wallet-checkout.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("PaymentSuccessCard provides a compact, receipt-style card with handwritten thank you message", () => {
  // Circular checkmark badge and payment verified badge
  assert.match(successCardSource, /receipt-success-badge/);
  assert.match(successCardSource, /PAYMENT VERIFIED/);

  // Handwritten / script thank you message
  assert.match(successCardSource, /invoice-thank-you/);
  assert.match(successCardSource, /Thank you for your business\./);

  // Prominent amount display
  assert.match(successCardSource, /AMOUNT PAID/);
  assert.match(successCardSource, /safeFormatMoney\(amountMinor, currency\)/);

  // Key-value confirmation details
  assert.match(successCardSource, /<dt>Status<\/dt>/);
  assert.match(successCardSource, /Verified on-chain/);
  assert.match(successCardSource, /<dt>Invoice reference<\/dt>/);
  assert.match(successCardSource, /<dt>Paid to<\/dt>/);
  assert.match(successCardSource, /<dt>Payment date<\/dt>/);
  assert.match(successCardSource, /<dt>Receipt number<\/dt>/);
  assert.match(successCardSource, /<dt>Settlement network<\/dt>/);
  assert.match(successCardSource, /<dt>Destination tx<\/dt>/);

  // Itemized breakdown and print action
  assert.match(successCardSource, /View itemized invoice/);
  assert.match(successCardSource, /Print Receipt/);
  assert.match(successCardSource, /window\.print\(\)/);

  // Extensible slot for upcoming 5-star service rating & written review feature
  assert.match(successCardSource, /receipt-review-slot/);
  assert.match(successCardSource, /\{reviewSlot\}/);

  // Subtle NODUS branding footer
  assert.match(successCardSource, /receipt-footer/);
  assert.match(successCardSource, /Powered by nodus\./);
});

test("Public invoice page renders PaymentSuccessCard when status === 'paid' (refresh preservation)", () => {
  assert.match(invoicePageSource, /import\s*\{[^}]*PaymentSuccessCard[^}]*\}\s*from\s*"@\/components\/payment-success-card"/);
  const paidMatch = invoicePageSource.match(/if \(status === "paid"\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(paidMatch, "if (status === 'paid') block exists");
  assert.match(paidMatch[1], /<PaymentSuccessCard/);
  assert.doesNotMatch(paidMatch[1], /<LazyInvoiceWalletCheckout/);
});

test("Invoice wallet checkout replaces checkout controls with PaymentSuccessCard upon verified settlement", () => {
  assert.match(checkoutSource, /import\s*\{[^}]*PaymentSuccessCard[^}]*\}\s*from\s*"@\/components\/payment-success-card"/);
  assert.match(checkoutSource, /if \(storedAttemptSettled\) \{\s*return \(\s*<PaymentSuccessCard/);
  assert.match(checkoutSource, /onPaymentSuccess=\{\(receipts\) => \{[\s\S]*?setStoredAttemptSettled\(true\);/);
});

test("Receipt card styles and print rules are present in globals.css", () => {
  assert.match(styles, /\.receipt-card-wrapper/);
  assert.match(styles, /\.receipt-card/);
  assert.match(styles, /\.receipt-success-badge/);
  assert.match(styles, /\.receipt-thank-you-title/);
  assert.match(styles, /\.receipt-amount-display/);
  assert.match(styles, /\.receipt-review-slot/);
  assert.match(styles, /@media print[\s\S]*?\.receipt-card/);
});
