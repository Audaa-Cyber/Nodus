import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const token = Buffer.alloc(32, 3).toString("base64url");
const recipient = `0x${"1".repeat(40)}`;
const currentWallet = `0x${"2".repeat(40)}`;
const invoice = { link_status: "active", business_name: "Merchant", invoice_number: "NOD-42", description: "Invoice items", amount_minor: 15000,
  currency: "USD", issue_date: "2026-11-18", due_date: null, status: "paid", seller_snapshot: { founder_name: "Actual Founder", founder_title: "Founder", review_url: "https://merchant.example/review" } };

function pageWith({ status = "paid", destinations = [{ receipt_number: "RCP-42", recipient_address: recipient }] } = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.resolve("src/app/pay/[token]/page.tsx"), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const testModule = { exports: {} };
  const localRequire = name => {
    if (name === "@/lib/supabase/server") return { createSupabaseServerClient: async () => ({ rpc: async method => {
      if (method === "lookup_shared_invoice") return { data: [{ ...invoice, status }], error: null };
      if (method === "lookup_shared_payment_context") return { data: [{ receiving_network: "arbitrum-sepolia", receiving_address: currentWallet }] };
      if (method === "lookup_shared_invoice_parties") return { data: [{ customer_name: "Customer" }] };
      if (method === "lookup_shared_payment_receipts") return { data: [{ receipt_number: "RCP-42", outcome: "VERIFIED" }] };
      if (method === "lookup_shared_receipt_destinations") return { data: destinations };
      throw new Error(`Unexpected RPC ${method}`);
    } }) };
    if (name === "@/lib/invoices") return { formatMoney: amount => `$${(amount / 100).toFixed(2)}` };
    if (name === "@/lib/invoice-design") return { parseInvoiceItems: () => [], settlementContract: () => null };
    if (name === "@/lib/wallet/networks") return { getWalletNetwork: () => ({ label: "Arbitrum Sepolia" }) };
    if (name === "@/components/payment-success-card") return { PaymentSuccessCard: function PaymentSuccessCard() {} };
    if (name === "@/components/payer-invoice-frame") return { PayerInvoiceFrame: function PayerInvoiceFrame() {} };
    if (name === "@/components/payer-invoice-sheet") return { PayerInvoiceSheet: function PayerInvoiceSheet() {} };
    if (name === "next/link") return { __esModule: true, default: function Link() {} };
    return require(name);
  };
  new Function("require", "module", "exports", output)(localRequire, testModule, testModule.exports);
  return testModule.exports.default;
}

test("paid refresh projects the historical settlement wallet rather than the merchant's current wallet", async () => {
  const rendered = await pageWith()({ params: Promise.resolve({ token }) });
  const receipt = rendered.props.children.props;
  assert.equal(receipt.recipientAddress, recipient);
  assert.equal(receipt.receipt.recipient_address, recipient);
  assert.notEqual(receipt.recipientAddress, currentWallet);
});

test("unavailable historical recipient evidence does not fall back to a mutable wallet", async () => {
  const rendered = await pageWith({ destinations: null })({ params: Promise.resolve({ token }) });
  assert.equal(rendered.props.children.props.recipientAddress, null);
  assert.equal(rendered.props.children.props.receipt.recipient_address, null);
});

test("paid refresh and live checkout receive the same merchant signature and review data", async () => {
  const paid = await pageWith()({ params: Promise.resolve({ token }) });
  const open = await pageWith({ status: "open" })({ params: Promise.resolve({ token }) });
  assert.deepEqual(paid.props.children.props.sellerDetails, open.props.checkout.sellerDetails);
  assert.equal(paid.props.children.props.sellerDetails.founderName, "Actual Founder");
  assert.equal(paid.props.children.props.sellerDetails.reviewUrl, "https://merchant.example/review");
  assert.equal(open.props.children[0].props.dueDate, "—");
});
