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

test("source proof, Quoted route difference and collapsed audit details remain available", () => {
  const payer = `0x${"11".repeat(20)}`;
  const html = render({
    primarySettlement: { ...props.primarySettlement, evidence: { ...props.primarySettlement.evidence, sourceProof: { payer } } },
    primaryAttempt: { id: "attempt-real", source_asset_id: "base-sepolia:usdc", source_network: "base-sepolia", destination_asset_id: "arbitrum-sepolia:usdc", destination_network: "arbitrum-sepolia", requested_amount: "2201000000", expected_received_amount: "2200000000", transaction_hash: props.primarySettlement.destination_tx_hashes[0], mode: "live", status: "SUCCESS" },
  });
  assert.match(html, /<details class="card"><summary>Technical payment details/);
  assert.doesNotMatch(html, /<details[^>]*open/);
  assert.match(html, /Quoted route difference<\/dt><dd>1\.000000/);
  assert.match(html, new RegExp(payer));
  assert.match(html, /sepolia\.basescan\.org\/tx\//);
});

test("merchant route keeps paid rendering behind invoice ownership and real persisted status", async () => {
  const source = await readFile(new URL("../src/app/dashboard/invoices/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!user\) redirect\("\/login"\)/);
  assert.match(source, /\.eq\("business_id", business\.id\)/);
  assert.match(source, /const isPaid = invoice\.status === "paid"/);
  assert.match(source, /if \(isPaid\) \{[\s\S]*?<PaidInvoiceDetailView/);
  assert.ok(source.indexOf("if (error || !invoice) notFound()") > source.indexOf("const { supabase, user, business }"));
  assert.doesNotMatch(source, /NearReconciliationLiveSync|near_settlement_outbox/);
});

test("payer wallet is visible in settlement details and the NEAR reconciliation block is removed", () => {
  const payer = `0x${"11".repeat(20)}`;
  const html = render({
    primarySettlement: {
      ...props.primarySettlement,
      evidence: { destinationProof: { payer } },
    },
    primaryAttempt: {
      id: "attempt-real", source_asset_id: "arbitrum-sepolia:usdc", source_network: "arbitrum-sepolia",
      destination_asset_id: "arbitrum-sepolia:usdc", destination_network: "arbitrum-sepolia",
      transaction_hash: props.primarySettlement.destination_tx_hashes[0], requested_amount: "2200000000",
      expected_received_amount: "2200000000", deposit_address: "0x0000000000000000000000000000000000000001",
      mode: "live", status: "SUCCESS", created_at: "2026-11-18T04:30:15Z", updated_at: "2026-11-18T04:30:15Z",
    },
  });
  assert.match(html, /Paid from wallet/);
  assert.match(html, new RegExp(payer));
  assert.doesNotMatch(html, /NEAR reconciliation|NEAR Transaction|nearblocks\.io/);
  assert.doesNotMatch(html, /Escrow smart contract/);
  assert.match(html, /Receipt number/);
});
