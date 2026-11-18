import test from "node:test";
import assert from "node:assert/strict";
import { render, props } from "./merchant-design-render.mjs";
const hash = props.primarySettlement.destination_tx_hashes[0];
const contract = props.primarySettlement.evidence.escrow_contract;

test("paid merchant surface renders the approved state and authoritative receipt and settlement", () => {
  const html = render();
  assert.match(html, /class="merchant-design" data-state="paid"/);
  assert.match(html, /class="card amt"/);
  assert.match(html, /Amount received/);
  assert.match(html, /Payment Verified On-Chain/);
  assert.match(html, /RECEIPT-REAL/);
  assert.match(html, new RegExp(`https://sepolia.arbiscan.io/tx/${hash}`));
  assert.match(html, new RegExp(`https://sepolia.arbiscan.io/address/${contract}`));
  assert.doesNotMatch(html, /INV-2026-8894|Apex Studio|William Jones|5\.0/);
});

test("approved party grid and table render all actual line items and invoice totals", () => {
  const html = render();
  assert.match(html, /class="parties"/);
  assert.match(html, /Actual Merchant/);
  assert.match(html, /Actual Customer/);
  assert.equal((html.match(/Actual item /g) ?? []).length, 5);
  assert.match(html, /\$2,000\.00/);
  assert.match(html, /\$200\.00/);
  assert.match(html, /Net Total Paid/);
});

test("missing payment evidence never fabricates a receipt or a verification explorer link", () => {
  const html = render({ primaryReceipt: null, primarySettlement: null });
  assert.match(html, /Unavailable/);
  assert.doesNotMatch(html, /RCP-REAL|sepolia\.arbiscan\.io\/tx|sepolia\.arbiscan\.io\/address/);
});

test("direct payment and missing eligible NEAR outbox remain distinguishable", () => {
  assert.match(render({ nearSettlementEligibility: "not_applicable" }), /not applicable to this direct or same-chain payment/);
  assert.match(render({ nearSettlementEligibility: "eligible" }), /outbox job is missing for this eligible payment/);
});
