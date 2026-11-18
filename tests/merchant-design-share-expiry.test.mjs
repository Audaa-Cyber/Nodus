import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { load } from "./merchant-design-render.mjs";
const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { default: InvoiceSharePanel } = load("src/components/invoice-share-panel.tsx");
const initialUrl = `https://nodus.example/pay/${"a".repeat(43)}`;
const render = (state, expiry) => renderToStaticMarkup(React.createElement(InvoiceSharePanel, { invoiceId: "invoice-expiry", invoiceNumber: "REAL", shareState: state, expiresAt: expiry, canShare: true, initialUrl }));

test("expired initial payment links cannot appear in the approved share panel or QR", () => {
  const html = render("expired", "2020-01-01T00:00:00Z");
  assert.doesNotMatch(html, /value="https:\/\/nodus\.example/);
  assert.doesNotMatch(html, /class="q"/);
  assert.match(html, /Generate QR code/);
});

test("a server-revoked initial payment link cannot override the none state", () => {
  assert.doesNotMatch(render("none", "2099-01-01T00:00:00Z"), /value="https:\/\/nodus\.example/);
});

test("an active initial payment link with past expiration is treated as expired", () => {
  assert.doesNotMatch(render("active", "2020-01-01T00:00:00Z"), /value="https:\/\/nodus\.example/);
});

test("browser cache cannot override authoritative revocation or a regenerated expiration", () => {
  const { resolveMerchantShareUrl } = load("src/components/merchant-share-state.ts");
  const cached = { url: initialUrl, expiresAt: "2099-01-01T00:00:00Z" };
  assert.equal(resolveMerchantShareUrl("none", cached.expiresAt, undefined, cached), "");
  assert.equal(resolveMerchantShareUrl("expired", cached.expiresAt, undefined, cached), "");
  assert.equal(resolveMerchantShareUrl("active", "2099-02-01T00:00:00Z", undefined, cached), "");
  assert.equal(resolveMerchantShareUrl("active", "invalid", undefined, cached), "");
  assert.equal(resolveMerchantShareUrl("active", cached.expiresAt, undefined, cached), initialUrl);
});

test("valid share presentation keeps exactly link and QR without added management controls", () => {
  const html = render("active", "2099-01-01T00:00:00Z");
  assert.match(html, /Copy Link/);
  assert.match(html, /class="q"/);
  assert.doesNotMatch(html, /Link options|Regenerate link|Revoke link|Download QR/);
});
