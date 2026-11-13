import test from "node:test";
import assert from "node:assert/strict";
import { buildNearSettlementPayload } from "../src/lib/payments/near-settlement-payload.ts";

const invoiceId = "00000000-0000-4000-8000-000000000001";
const attemptId = "00000000-0000-4000-8000-000000000002";
const settlementId = "00000000-0000-4000-8000-00000000000b";
const sourceHash = `0x${"b".repeat(64)}`;
const destinationHash = `0x${"c".repeat(64)}`;
const recipient = `0x${"2".repeat(40)}`;
const token = "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d";
const inv12Nonce = "0x4ee259295b1fcf171b082ba2a1b0d46a9b0b5bc9fa55ff3d2178f5574c05ebba";

function fixture(overrides = {}) {
  const sourceProof = {
    sourceTransactionHash: sourceHash,
    sourceBlockNumber: "100",
    sourceBlockHash: `0x${"1".repeat(64)}`,
    payer: `0x${"3".repeat(40)}`,
    amount: "100000000",
    sourceDomain: 6,
    nonce: inv12Nonce,
    messageHash: sourceHash,
  };
  const destinationProof = {
    verified: true,
    finalityConfirmed: true,
    amount: "100000000",
    transactionHashes: [destinationHash],
    transactions: [{ transactionHash: destinationHash, blockNumber: "101", blockHash: `0x${"2".repeat(64)}` }],
  };
  return {
    settlement: {
      id: settlementId,
      payment_attempt_id: attemptId,
      invoice_id: invoiceId,
      business_id: "business-1",
      provider_status: "SUCCESS",
      outcome: "VERIFIED",
      destination_asset_id: "arbitrum-sepolia:usdc",
      destination_network: "arbitrum-sepolia",
      recipient_address: recipient,
      received_amount_base_units: "100000000",
      received_asset_decimals: 6,
      received_value_invoice_minor: "10000",
      destination_tx_hashes: [destinationHash],
      evidence: { sourceProof, destinationProof },
      created_at: "2026-11-12T00:00:00.000Z",
    },
    attempt: {
      id: attemptId,
      invoice_id: invoiceId,
      business_id: "business-1",
      mode: "live",
      source_network: "base-sepolia",
      destination_network: "arbitrum-sepolia",
      source_asset_id: "base-sepolia:usdc",
      destination_asset_id: "arbitrum-sepolia:usdc",
      recipient_address: recipient,
      transaction_hash: sourceHash,
      quote_snapshot: { type: "circle_cctp", sourceUsdc: "0x036cbd53842c5426634e7929541ec2318f3dcf7e" },
    },
    invoice: {
      id: invoiceId,
      business_id: "business-1",
      amount_minor: 10000,
      currency: "USD",
    },
    canonicalTokenAddress: token,
    overrides,
  };
}

test("builds the deployed ABI payload and the contract-compatible evidence digest", () => {
  const payload = buildNearSettlementPayload(fixture());
  assert.deepEqual(payload.invoiceArgs, {
    invoice_id: invoiceId,
    terms: {
      currency: "USD",
      amount_minor: "10000",
      destination_chain_id: 421614,
      token_decimals: 6,
      token_address: token,
      merchant_recipient: recipient,
    },
  });
  assert.deepEqual(payload.attemptArgs, {
    attempt_id: attemptId,
    invoice_id: invoiceId,
    source_chain_id: 84532,
  });
  assert.deepEqual(payload.attestationArgs.input, {
    reconciliation_id: settlementId,
    attempt_id: attemptId,
    source_chain_id: 84532,
    source_transaction_hash: sourceHash,
    source_block_number: 100,
    source_block_hash: `0x${"1".repeat(64)}`,
    cctp_source_domain: 6,
    cctp_message_nonce: inv12Nonce,
    cctp_message_hash: sourceHash,
    destination_chain_id: 421614,
    destination_transaction_hash: destinationHash,
    destination_block_number: 101,
    destination_block_hash: `0x${"2".repeat(64)}`,
    token_address: token,
    merchant_recipient: recipient,
    amount_base_units: "100000000",
    token_decimals: 6,
    verifier_policy_version: 1,
    evidence_digest: "0x629340847e8e8b346e3293636dbc207dc449b7fdf1343ffe409231c28a45b47b",
  });
});

test("rejects evidence that was not destination-verified and final", () => {
  assert.throws(() => buildNearSettlementPayload({
    ...fixture(),
    settlement: {
      ...fixture().settlement,
      evidence: { ...fixture().settlement.evidence, destinationProof: { verified: true, finalityConfirmed: false } },
    },
  }), /near_destination_evidence_unverified/);
});

test("preserves the actual INV-12 full-width nonce in the V2 attestation", () => {
  const payload = buildNearSettlementPayload(fixture());
  assert.equal(payload.attestationArgs.input.cctp_message_nonce, inv12Nonce);
  assert.equal(payload.attestationArgs.input.cctp_source_domain, 6);
  assert.match(payload.attestationArgs.input.evidence_digest, /^0x[0-9a-f]{64}$/);
});

test("accepts the maximum-width CCTP V2 nonce without numeric conversion", () => {
  const value = fixture();
  const nonce = `0x${"ff".repeat(32)}`;
  value.settlement.evidence.sourceProof.nonce = nonce;
  const payload = buildNearSettlementPayload(value);
  assert.equal(payload.attestationArgs.input.cctp_message_nonce, nonce);
});

test("rejects malformed CCTP V2 nonce hex", () => {
  const value = fixture();
  value.settlement.evidence.sourceProof.nonce = `0x${"g".repeat(64)}`;
  assert.throws(() => buildNearSettlementPayload(value), /near_evidence_nonce_invalid/);
});

test("rejects CCTP V2 nonces with the wrong byte length", () => {
  const value = fixture();
  value.settlement.evidence.sourceProof.nonce = `0x${"ab".repeat(31)}`;
  assert.throws(() => buildNearSettlementPayload(value), /near_evidence_nonce_invalid/);
});

test("commits every nonce byte and source domain in the payload digest", () => {
  const original = buildNearSettlementPayload(fixture()).attestationArgs.input;
  const changedNonce = fixture();
  changedNonce.settlement.evidence.sourceProof.nonce = `0x${"00".repeat(31)}01`;
  assert.notEqual(buildNearSettlementPayload(changedNonce).attestationArgs.input.evidence_digest, original.evidence_digest);
  assert.equal(original.evidence_digest, "0x629340847e8e8b346e3293636dbc207dc449b7fdf1343ffe409231c28a45b47b");
});

test("builds NEAR attestations for each supported testnet source and destination pair", () => {
  const supported = {
    sepolia: { chainId: 11155111, domain: 0, token: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238" },
    "base-sepolia": { chainId: 84532, domain: 6, token: "0x036cbd53842c5426634e7929541ec2318f3dcf7e" },
    "arbitrum-sepolia": { chainId: 421614, domain: 3, token: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d" },
    "optimism-sepolia": { chainId: 11155420, domain: 2, token: "0x5fd84259d66cd46123540766be93dfe6d43130d7" },
  };
  for (const [sourceNetwork, source] of Object.entries(supported)) {
    for (const [destinationNetwork, destination] of Object.entries(supported)) {
      if (sourceNetwork === destinationNetwork) continue;
      const input = fixture();
      input.attempt.source_network = sourceNetwork;
      input.attempt.destination_network = destinationNetwork;
      input.attempt.source_asset_id = `${sourceNetwork}:usdc`;
      input.attempt.quote_snapshot.sourceDomain = source.domain;
      input.attempt.destination_asset_id = `${destinationNetwork}:usdc`;
      input.settlement.evidence.sourceProof.sourceDomain = source.domain;
      input.attempt.quote_snapshot.sourceUsdc = source.token;
      input.settlement.destination_network = destinationNetwork;
      input.settlement.destination_asset_id = `${destinationNetwork}:usdc`;
      input.canonicalTokenAddress = destination.token;
      const payload = buildNearSettlementPayload(input);
      assert.equal(payload.attemptArgs.source_chain_id, source.chainId, `${sourceNetwork} source chain`);
      assert.equal(payload.attestationArgs.input.cctp_source_domain, source.domain, `${sourceNetwork} CCTP domain`);
      assert.equal(payload.invoiceArgs.terms.destination_chain_id, destination.chainId, `${destinationNetwork} destination chain`);
      assert.equal(payload.invoiceArgs.terms.token_address, destination.token);
    }
  }
});

test("rejects multiple destination transactions because the deployed ABI attests one destination hash", () => {
  const value = fixture();
  value.settlement = {
    ...value.settlement,
    destination_tx_hashes: [destinationHash, `0x${"d".repeat(64)}`],
    evidence: {
      ...value.settlement.evidence,
      destinationProof: {
        ...value.settlement.evidence.destinationProof,
        transactionHashes: [destinationHash, `0x${"d".repeat(64)}`],
        transactions: [
          ...value.settlement.evidence.destinationProof.transactions,
          { transactionHash: `0x${"d".repeat(64)}`, blockNumber: "102", blockHash: `0x${"4".repeat(64)}` },
        ],
      },
    },
  };
  assert.throws(() => buildNearSettlementPayload(value), /near_destination_transaction_count_unsupported/);
});

test("does not construct a NEAR attestation from a client-only or non-CCTP attempt", () => {
  const value = fixture();
  value.attempt = { ...value.attempt, quote_snapshot: { type: "circle_direct" } };
  assert.throws(() => buildNearSettlementPayload(value), /near_settlement_route_unsupported/);
});
