import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { render, props } from "./merchant-design-render.mjs";

test("received amount remains separate from invoice principal for an overpayment", () => {
  const html = render({ primarySettlement: { ...props.primarySettlement, outcome: "OVERPAID", received_amount_base_units: "2400000000" } });
  assert.match(html, /\$2,400\.00/);
  assert.match(html, /Net Total Paid/);
  assert.match(html, /\$2,200\.00/);
});

test("invalid hashes cannot become destination explorer links", () => {
  const html = render({ primarySettlement: { ...props.primarySettlement, destination_tx_hashes: ["javascript:alert(1)", "0x1234", null, 4] } });
  assert.doesNotMatch(html, /\/tx\//);
  assert.match(html, /Destination transaction hash<\/dt><dd>Unavailable/);
});

test("source proof, Circle fees and collapsed audit details remain available", () => {
  const payer = `0x${"11".repeat(20)}`;
  const html = render({
    primarySettlement: { ...props.primarySettlement, evidence: { ...props.primarySettlement.evidence, sourceProof: { payer } } },
    primaryAttempt: { id: "attempt-real", source_asset_id: "base-sepolia:usdc", source_network: "base-sepolia", destination_asset_id: "arbitrum-sepolia:usdc", destination_network: "arbitrum-sepolia", requested_amount: "2201000000", expected_received_amount: "2200000000", transaction_hash: props.primarySettlement.destination_tx_hashes[0], mode: "live", status: "SUCCESS" },
  });
  assert.match(html, /<details class="card"><summary>Technical payment details/);
  assert.doesNotMatch(html, /<details[^>]*open/);
  assert.match(html, /Circle fees<\/dt><dd>1\.000000/);
  assert.match(html, new RegExp(payer));
  assert.match(html, /sepolia\.basescan\.org\/tx\//);
});

test("NEAR submitted evidence remains distinct from confirmed contract readback", () => {
  const entry = { id: "outbox-real", status: "processing", near_transaction_hash: "near-real", submitted_at: "2026-11-18T04:31:00Z", attempt_count: 1, last_error_code: null };
  assert.match(render({ primaryNearEntry: entry }), /Submitted to NEAR; awaiting contract confirmation/);
  assert.match(render({ primaryNearEntry: { ...entry, status: "submitted" } }), /Reconciliation confirmed on NEAR/);
  assert.match(render({ primaryNearEntry: { ...entry, status: "submitted", near_transaction_hash: null } }), /confirmation evidence is incomplete/);
  assert.match(render({ nearOutboxError: true }), /temporarily unavailable/);
});

test("merchant route keeps paid rendering behind invoice ownership and real persisted status", async () => {
  const source = await readFile(new URL("../src/app/dashboard/invoices/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!user\) redirect\("\/login"\)/);
  assert.match(source, /\.eq\("business_id", business\.id\)/);
  assert.match(source, /const isPaid = invoice\.status === "paid"/);
  assert.match(source, /if \(isPaid\) \{[\s\S]*?<PaidInvoiceDetailView/);
  assert.ok(source.indexOf("if (error || !invoice) notFound()") < source.indexOf("getSupabaseAdminClient()"));
});
