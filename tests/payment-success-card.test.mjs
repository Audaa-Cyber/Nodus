import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const successCardSource = await readFile(new URL("../src/components/payment-success-card.tsx", import.meta.url), "utf8");
const invoicePageSource = await readFile(new URL("../src/app/pay/[token]/page.tsx", import.meta.url), "utf8");
const checkoutSource = await readFile(new URL("../src/components/wallet/invoice-wallet-checkout.tsx", import.meta.url), "utf8");

test("Receipt renders the locked scroll surface instead of the former receipt card", () => {
  for (const required of ["scroll-design", 'className="stage"', 'className="scroll"', 'data-state="closed"', 'className="paper"', 'className="sheet"', 'className="spindle"', 'className="fin t"', 'className="fin b"', "Thank You!", "ON-CHAIN VERIFIED", "Business owner dossier", "Download Official Receipt (PDF)", "Roll Back Up"]) {
    assert.ok(successCardSource.includes(required), `Missing approved receipt structure: ${required}`);
  }
  assert.match(successCardSource, /<InvoiceRating/);
  assert.doesNotMatch(successCardSource, /Acme Design Labs|INV-2026-8894|0x7be3a1/);
});

test("Receipt only offers an official PDF after a successful PDF response", () => {
  assert.match(successCardSource, /\/api\/pay\/\$\{encodeURIComponent\(shareToken\)\}\/receipt/);
  assert.match(successCardSource, /response\.ok/);
  assert.match(successCardSource, /application\/pdf/);
  assert.match(successCardSource, /URL\.revokeObjectURL/);
});

test("Public paid invoice refresh still renders PaymentSuccessCard without checkout controls", () => {
  assert.match(invoicePageSource, /import\s*\{[^}]*PaymentSuccessCard[^}]*\}\s*from\s*"@\/components\/payment-success-card"/);
  const paidMatch = invoicePageSource.match(/if \(status === "paid"\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(paidMatch);
  assert.match(paidMatch[1], /<PaymentSuccessCard/);
  assert.doesNotMatch(paidMatch[1], /<LazyInvoiceWalletCheckout/);
});

test("Verified live settlement still replaces checkout controls with the receipt", () => {
  assert.match(checkoutSource, /if \(storedAttemptSettled\) \{\s*return \(\s*<PaymentSuccessCard/);
  assert.match(checkoutSource, /onPaymentSuccess=\{\(receipts\) => \{[\s\S]*?setStoredAttemptSettled\(true\);/);
});
