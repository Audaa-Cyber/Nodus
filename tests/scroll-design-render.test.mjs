import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const nativeRequire = createRequire(import.meta.url);
function loadTypeScript(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  const testModule = { exports: {} };
  new Function("require", "module", "exports", compiled)(name => dependencies[name] ?? nativeRequire(name), testModule, testModule.exports);
  return testModule.exports;
}
const networks = loadTypeScript("../src/lib/wallet/networks.ts");
const motion = loadTypeScript("../src/components/scroll-motion.ts");
const { PaymentSuccessCard } = loadTypeScript("../src/components/payment-success-card.tsx", {
  "@/lib/wallet/networks": networks,
  "./scroll-motion": motion,
  "@/components/invoice-feedback": { InvoiceRating: () => React.createElement("div", { className: "fb" }) },
});

function render(props = {}) {
  return renderToStaticMarkup(React.createElement(PaymentSuccessCard, {
    invoiceNumber: "REAL-841", amountMinor: 12000, currency: "USD", businessName: "Real Company", destinationNetwork: "arbitrum-sepolia", ...props,
  }));
}

test("Approved receipt uses the actual settled amount and transaction explorer without sample identities", () => {
  const hash = `0x${"ab".repeat(32)}`;
  const output = render({ receipt: { business_name: "Receipt Merchant", received_amount_base_units: "125123000", received_asset_decimals: 6, destination_network: "arbitrum-sepolia", destination_tx_hashes: [hash], issued_at: "2026-01-02T03:04:05Z" } });
  assert.ok(output.includes("$125.123 USDC"));
  assert.ok(output.includes("Receipt Merchant"));
  assert.ok(output.includes(`https://sepolia.arbiscan.io/tx/${hash}`));
  assert.ok(output.includes("Jan 2, 2026"));
  assert.ok(output.includes("03:04:05 UTC"));
  assert.ok(!output.includes("Acme Design Labs"));
  assert.ok(!output.includes("INV-2026-8894"));
});

test("Unavailable receipt evidence stays unavailable and untrusted strings render as text", () => {
  const output = render({ businessName: "<script>alert(1)</script>", receipt: { destination_tx_hashes: ["javascript:alert(1)"] } });
  assert.ok(output.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(!output.includes("<script>"));
  assert.ok(!output.includes("javascript:alert(1)"));
  assert.ok(output.includes("Date unavailable"));
  assert.ok(output.includes("Time unavailable"));
  assert.ok(!output.includes("RCP-REAL"));
});

test("Receipt starts rolled closed and sheet contents are inert with independent SVG definition identifiers", () => {
  const first = render();
  assert.ok(first.includes('data-state="closed"'));
  assert.ok(first.includes('aria-expanded="false"'));
  assert.ok(first.includes('class="sheet" inert=""'));
  assert.equal((first.match(/class="fin t"/g) || []).length, 2);
  assert.equal((first.match(/class="fin b"/g) || []).length, 2);
  const both = renderToStaticMarkup(React.createElement("div", null, React.createElement(PaymentSuccessCard, { invoiceNumber: "ONE", amountMinor: 100, currency: "USD" }), React.createElement(PaymentSuccessCard, { invoiceNumber: "TWO", amountMinor: 200, currency: "USD" })));
  const identifiers = [...both.matchAll(/id="([^"]+-goldH)"/g)].map(match => match[1]);
  assert.equal(identifiers.length, 2);
  assert.notEqual(identifiers[0], identifiers[1]);
});

test("A later partial receipt never replaces the full verified settlement in the scroll", () => {
  const partialHash = `0x${"11".repeat(32)}`, verifiedHash = `0x${"22".repeat(32)}`;
  const partial = { receipt_number: "PARTIAL-NEW", outcome: "PARTIAL", received_amount_base_units: "1000000", received_asset_decimals: 6, destination_tx_hashes: [partialHash] };
  const verified = { receipt_number: "VERIFIED-OLD", outcome: "VERIFIED", received_amount_base_units: "120000000", received_asset_decimals: 6, destination_tx_hashes: [verifiedHash] };
  const output = render({ receipt: partial, receipts: [partial, verified] });
  assert.ok(output.includes('data-receipt-number="VERIFIED-OLD"'));
  assert.ok(output.includes("$120.00 USDC"));
  assert.ok(output.includes(verifiedHash));
  assert.ok(!output.includes(partialHash));
});

test("Payee dossier prefers the immutable receipt recipient over a changed merchant wallet", () => {
  const output = render({ recipientAddress: `0x${"bb".repeat(20)}`, receipt: { outcome: "VERIFIED", recipient_address: `0x${"aa".repeat(20)}` } });
  assert.ok(output.includes("Payee: 0xaaaaaa...aaaaaa"));
  assert.ok(!output.includes("0xbbbbbb...bbbbbb"));
});

test("The approved PDF button opens Print/Save PDF for the server's Unicode fallback signal", async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  let printCalls = 0, cleanup;
  const updates = [];
  const hooks = { ...React, useId: () => "test-scroll", useRef: value => ({ current: value }),
    useState: initial => [initial, value => updates.push(value)], useEffect: effect => { cleanup = effect(); } };
  const { PaymentSuccessCard: InteractiveReceipt } = loadTypeScript("../src/components/payment-success-card.tsx", {
    react: hooks, "@/lib/wallet/networks": networks,
    "./scroll-motion": { mountApprovedScroll: () => () => {} },
    "@/components/invoice-feedback": { InvoiceRating: () => null },
  });
  globalThis.window = { print: () => { printCalls++; } };
  globalThis.fetch = async () => new Response(JSON.stringify({ code: "unicode_receipt_requires_print" }), { status: 422, headers: { "Content-Type": "application/json" } });
  function button(node) {
    if (!node || typeof node !== "object") return null;
    if (node.type === "button" && node.props.className === "btn pri") return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const match = button(child);
      if (match) return match;
    }
    return null;
  }
  try {
    const rendered = InteractiveReceipt({ invoiceNumber: "UNICODE-1", amountMinor: 100, currency: "USD", shareToken: "a".repeat(43), businessName: "ንግድ" });
    button(rendered).props.onClick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(printCalls, 1);
    assert.ok(updates.includes(true), "PDF action enters busy state");
    assert.equal(updates.at(-1), false, "PDF action clears busy state after print fallback");
  } finally {
    cleanup?.();
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});
