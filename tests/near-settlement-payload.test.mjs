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

function fixture(overrides = {}) {
  const sourceProof = {
    sourceTransactionHash: sourceHash,
    sourceBlockNumber: "100",
    sourceBlockHash: `0x${"1".repeat(64)}`,
    payer: `0x${"3".repeat(40)}`,
    amount: "100000000",
    nonce: "11",
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
      quote_snapshot: { type: "circle_cctp" },
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
    cctp_message_nonce: 11,
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
    evidence_digest: "0x1c6d92fab5adfa93fcb918d3ebcd3a71cf192e1c506fd10891b4336a01884776",
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
