import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const cache = new Map();
function loadTsx(filename) {
  if (cache.has(filename)) return cache.get(filename);
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  const testModule = { exports: {} };
  const localRequire = (name) => {
    if (name === "next/image") return { __esModule: true, default: (props) => { const imageProps = { ...props }; delete imageProps.unoptimized; return React.createElement("img", imageProps); } };
    if (name.startsWith(".")) return loadTsx(path.resolve(path.dirname(filename), `${name}.tsx`));
    return require(name);
  };
  new Function("require", "module", "exports", outputText)(localRequire, testModule, testModule.exports);
  cache.set(filename, testModule.exports);
  return testModule.exports;
}

const { PayerInvoiceSheet } = loadTsx(path.resolve("src/components/payer-invoice-sheet.tsx"));
const invoice = {
  invoiceNumber: "NOD-42", status: "open", businessName: "Real Merchant", customerName: "Real Customer",
  customerEmail: "customer@example.org", amount: "$150.00", subtotal: "$150.00", tax: "$0.00", taxPercent: "0", discount: "$0.00",
  issueDate: "18 Nov 2026", dueDate: "28 Nov 2026", network: "Base Sepolia", recipient: "0xabcd…1234", escrowContract: "Unavailable",
  items: Array.from({ length: 5 }, (_, index) => ({ description: `Service ${index + 1}`, quantity: 1, unitPriceMinor: 3000, lineTotalMinor: 3000, price: "$30.00", total: "$30.00" })),
};

test("payer sheet renders the five real line items in the approved five-column table", () => {
  const html = renderToStaticMarkup(React.createElement(PayerInvoiceSheet, invoice));
  assert.equal((html.match(/<th(?:\s|>)/g) ?? []).length, 5);
  assert.equal((html.match(/<td class="ds">/g) ?? []).length, 5);
  for (let index = 1; index <= 5; index++) assert.ok(html.includes(`Service ${index}`));
  assert.ok(html.includes("$150.00 USDC"));
  assert.doesNotMatch(html, /Apex Studio|William Jones|2,200\.00|Arbitrum Sepolia/);
});

test("payer customer and merchant values are escaped and missing dossier fields are not invented", () => {
  const html = renderToStaticMarkup(React.createElement(PayerInvoiceSheet, { ...invoice, customerName: '<script>alert("unsafe")</script>' }));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.doesNotMatch(html, /<script>/);
  assert.ok(html.includes("Tax ID / EIN: —"));
  assert.ok(html.includes("Unavailable"));
  assert.ok(html.includes("Real Merchant"));
});

test("missing due date does not render a fabricated DUE marker", () => {
  const html = renderToStaticMarkup(React.createElement(PayerInvoiceSheet, { ...invoice, dueDate: "—" }));
  assert.doesNotMatch(html, /DUE /);
  assert.ok(html.includes("DATE DUE:"));
});
