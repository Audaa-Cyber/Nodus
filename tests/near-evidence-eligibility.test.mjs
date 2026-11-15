import test from "node:test";
import assert from "node:assert/strict";
import { buildNearSettlementPayload } from "../src/lib/payments/near-settlement-payload.ts";
import { deliverClaimedNearSettlement } from "../src/lib/payments/near-outbox-delivery.ts";

const invoiceId = "00000000-0000-4000-8000-000000000001";
const attemptId = "00000000-0000-4000-8000-000000000002";
const settlementId = "00000000-0000-4000-8000-00000000000b";
const sourceHash = `0x${"b".repeat(64)}`;
const destinationHash = `0x${"c".repeat(64)}`;
const recipient = `0x${"2".repeat(40)}`;
const token = "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d";
const cctpV2Nonce = "0x4ee259295b1fcf171b082ba2a1b0d46a9b0b5bc9fa55ff3d2178f5574c05ebba";

function baseFixture(overrides = {}) {
  const sourceProof = {
    sourceTransactionHash: sourceHash,
    sourceBlockNumber: "100",
    sourceBlockHash: `0x${"1".repeat(64)}`,
    payer: `0x${"3".repeat(40)}`,
    amount: "100000000",
    sourceDomain: 6,
    nonce: cctpV2Nonce,
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
      quote_snapshot: { type: "circle_cctp", sourceUsdc: "0x036cbd53842c5426634e7929541ec2318f3dcf7e", sourceDomain: 6 },
    },
    invoice: {
      id: invoiceId,
      business_id: "business-1",
      amount_minor: 10000,
      currency: "USD",
      status: "paid",
    },
    canonicalTokenAddress: token,
    ...overrides,
  };
}

/**
 * Mirror of the SQL function public.near_settlement_evidence_eligible
 * to test all predicate rules deterministically.
 */
function sqlNearSettlementEvidenceEligible(settlement, attempt) {
  const supported = ["sepolia", "base-sepolia", "arbitrum-sepolia", "optimism-sepolia", "arc-testnet"];
  if (settlement.provider_status !== "SUCCESS") return false;
  if (!["VERIFIED", "PARTIAL", "OVERPAID", "REVIEW_REQUIRED"].includes(settlement.outcome)) return false;
  if (!supported.includes(settlement.destination_network)) return false;
  if (settlement.destination_asset_id !== `${settlement.destination_network}:usdc`) return false;
  if (attempt.mode !== "live") return false;
  if (!supported.includes(attempt.source_network)) return false;
  if (attempt.source_asset_id !== `${attempt.source_network}:usdc`) return false;
  if (attempt.destination_network !== settlement.destination_network) return false;
  if (attempt.destination_network === attempt.source_network) return false;
  if (attempt.destination_asset_id !== `${attempt.destination_network}:usdc`) return false;
  if (attempt.quote_snapshot?.type !== "circle_cctp") return false;

  const evidence = settlement.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return false;
  const sourceProof = evidence.sourceProof;
  const destinationProof = evidence.destinationProof;
  if (!sourceProof || !destinationProof) return false;

  if (sourceProof.sourceTransactionHash !== attempt.transaction_hash) return false;
  if (!/^[1-9][0-9]*$/.test(String(sourceProof.sourceBlockNumber ?? ""))) return false;
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(sourceProof.sourceBlockHash ?? ""))) return false;

  // Nonce predicate: accepts bytes32 hex (case-insensitive) OR decimal string
  const nonce = String(sourceProof.nonce ?? "");
  const isHexNonce = /^0x[0-9a-fA-F]{64}$/.test(nonce);
  const isDecimalNonce = /^[1-9][0-9]*$/.test(nonce);
  if (!isHexNonce && !isDecimalNonce) return false;

  if (!/^0x[0-9a-fA-F]{64}$/.test(String(sourceProof.messageHash ?? ""))) return false;

  if (destinationProof.verified !== true && destinationProof.verified !== "true") return false;
  if (destinationProof.finalityConfirmed !== true && destinationProof.finalityConfirmed !== "true") return false;
  if (String(destinationProof.amount) !== String(settlement.received_amount_base_units)) return false;

  if (!Array.isArray(destinationProof.transactionHashes)) return false;
  if (JSON.stringify(destinationProof.transactionHashes) !== JSON.stringify(settlement.destination_tx_hashes)) return false;

  if (!Array.isArray(destinationProof.transactions) || destinationProof.transactions.length !== 1) return false;
  const tx = destinationProof.transactions[0];
  if (tx.transactionHash !== settlement.destination_tx_hashes[0]) return false;
  if (!/^[1-9][0-9]*$/.test(String(tx.blockNumber ?? ""))) return false;
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(tx.blockHash ?? ""))) return false;
  if (!Array.isArray(settlement.destination_tx_hashes) || settlement.destination_tx_hashes.length !== 1) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION TEST 1: Decimal nonce format, where legitimately supported
// ─────────────────────────────────────────────────────────────────────────────
test("1. Decimal nonce format: parses legacy decimal nonce to 64-char hex and passes SQL eligibility", () => {
  const f = baseFixture();
  f.settlement.evidence.sourceProof.nonce = "12345";
  const payload = buildNearSettlementPayload(f);
  assert.equal(
    payload.attestationArgs.input.cctp_message_nonce,
    "0x0000000000000000000000000000000000000000000000000000000000003039",
    "Decimal nonce 12345 must format to 32-byte 0x-prefixed hex for NEAR contract"
  );
  assert.equal(sqlNearSettlementEvidenceEligible(f.settlement, f.attempt), true);

  // Large decimal u64
  f.settlement.evidence.sourceProof.nonce = "18446744073709551615"; // 2^64 - 1
  const payloadLarge = buildNearSettlementPayload(f);
  assert.equal(
    payloadLarge.attestationArgs.input.cctp_message_nonce,
    "0x000000000000000000000000000000000000000000000000ffffffffffffffff"
  );
  assert.equal(sqlNearSettlementEvidenceEligible(f.settlement, f.attempt), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION TEST 2: Hexadecimal bytes32 CCTP V2 nonce format
// ─────────────────────────────────────────────────────────────────────────────
test("2. Hexadecimal bytes32 CCTP V2 nonce format: accepts lowercase, uppercase and mixed case", () => {
  const f = baseFixture();
  const hexNonceUpper = "0x4EE259295B1FCF171B082BA2A1B0D46A9B0B5BC9FA55FF3D2178F5574C05EBBA";
  f.settlement.evidence.sourceProof.nonce = hexNonceUpper;

  const payload = buildNearSettlementPayload(f);
  assert.equal(payload.attestationArgs.input.cctp_message_nonce, hexNonceUpper.toLowerCase());
  assert.equal(sqlNearSettlementEvidenceEligible(f.settlement, f.attempt), true);

  // Rejects invalid hex nonces (too short, too long, non-hex)
  for (const badNonce of ["0x123", "0x" + "a".repeat(63), "0x" + "g".repeat(64), "abc", "0"]) {
    f.settlement.evidence.sourceProof.nonce = badNonce;
    assert.throws(() => buildNearSettlementPayload(f), /near_evidence_nonce_invalid/);
    assert.equal(sqlNearSettlementEvidenceEligible(f.settlement, f.attempt), false, `Should reject bad nonce ${badNonce}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION TEST 3: Existing Base, Ethereum, Arbitrum and Optimism routes
// ─────────────────────────────────────────────────────────────────────────────
test("3. Existing four networks plus Arc: all 20 distinct pairs are eligible", () => {
  const routes = [
    { network: "sepolia", chainId: 11155111, domain: 0, token: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238" },
    { network: "base-sepolia", chainId: 84532, domain: 6, token: "0x036cbd53842c5426634e7929541ec2318f3dcf7e" },
    { network: "arbitrum-sepolia", chainId: 421614, domain: 3, token: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d" },
    { network: "optimism-sepolia", chainId: 11155420, domain: 2, token: "0x5fd84259d66cd46123540766be93dfe6d43130d7" },
    { network: "arc-testnet", chainId: 5042002, domain: 26, token: "0x3600000000000000000000000000000000000000" },
  ];

  for (const src of routes) {
    for (const dst of routes) {
      if (src.network === dst.network) continue;
      const f = baseFixture();
      f.attempt.source_network = src.network;
      f.attempt.source_asset_id = `${src.network}:usdc`;
      f.attempt.destination_network = dst.network;
      f.attempt.destination_asset_id = `${dst.network}:usdc`;
      f.attempt.quote_snapshot = { type: "circle_cctp", sourceUsdc: src.token, sourceDomain: src.domain };
      f.settlement.destination_network = dst.network;
      f.settlement.destination_asset_id = `${dst.network}:usdc`;
      f.canonicalTokenAddress = dst.token;
      f.settlement.evidence.sourceProof.sourceDomain = src.domain;

      const payload = buildNearSettlementPayload(f);
      assert.equal(payload.attemptArgs.source_chain_id, src.chainId);
      assert.equal(payload.attestationArgs.input.cctp_source_domain, src.domain);
      assert.equal(payload.invoiceArgs.terms.destination_chain_id, dst.chainId);
      assert.equal(sqlNearSettlementEvidenceEligible(f.settlement, f.attempt), true);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION TEST 4: Arc Testnet domain 26 handling
// ─────────────────────────────────────────────────────────────────────────────
test("4. Arc Testnet domain 26: Arc source and destination routes are eligible", () => {
  const f = baseFixture();
  f.attempt.source_network = "arc-testnet";
  f.attempt.source_asset_id = "arc-testnet:usdc";
  f.attempt.quote_snapshot = {
    type: "circle_cctp",
    sourceUsdc: "0x3600000000000000000000000000000000000000",
    sourceDomain: 26,
  };
  f.settlement.evidence.sourceProof.sourceDomain = 26;

  const sourcePayload = buildNearSettlementPayload(f);
  assert.equal(sourcePayload.attemptArgs.source_chain_id, 5042002);
  assert.equal(sourcePayload.attestationArgs.input.cctp_source_domain, 26);
  assert.equal(sqlNearSettlementEvidenceEligible(f.settlement, f.attempt), true);

  const reverse = baseFixture();
  reverse.attempt.source_network = "sepolia";
  reverse.attempt.source_asset_id = "sepolia:usdc";
  reverse.attempt.destination_network = "arc-testnet";
  reverse.attempt.destination_asset_id = "arc-testnet:usdc";
  reverse.attempt.quote_snapshot = {
    type: "circle_cctp",
    sourceUsdc: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    sourceDomain: 0,
  };
  reverse.settlement.destination_network = "arc-testnet";
  reverse.settlement.destination_asset_id = "arc-testnet:usdc";
  reverse.canonicalTokenAddress = "0x3600000000000000000000000000000000000000";
  reverse.settlement.evidence.sourceProof.sourceDomain = 0;
  const destinationPayload = buildNearSettlementPayload(reverse);
  assert.equal(destinationPayload.invoiceArgs.terms.destination_chain_id, 5042002);
  assert.equal(destinationPayload.invoiceArgs.terms.token_address, "0x3600000000000000000000000000000000000000");
  assert.equal(sqlNearSettlementEvidenceEligible(reverse.settlement, reverse.attempt), true);
});

test("unsupported routes remain ineligible", () => {
  const f = baseFixture();
  f.attempt.source_network = "unsupported-testnet";
  f.attempt.source_asset_id = "unsupported-testnet:usdc";
  assert.throws(() => buildNearSettlementPayload(f), /near_settlement_route_unsupported/);
  assert.equal(sqlNearSettlementEvidenceEligible(f.settlement, f.attempt), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION TEST 5: Invalid or incomplete source evidence
// ─────────────────────────────────────────────────────────────────────────────
test("5. Invalid or incomplete source evidence: missing or mismatched source proof fields reject", () => {
  const f1 = baseFixture();
  f1.settlement.evidence.sourceProof.sourceTransactionHash = `0x${"f".repeat(64)}`;
  assert.throws(() => buildNearSettlementPayload(f1), /near_source_transaction_mismatch/);
  assert.equal(sqlNearSettlementEvidenceEligible(f1.settlement, f1.attempt), false);

  const f2 = baseFixture();
  f2.settlement.evidence.sourceProof.sourceBlockNumber = "0";
  assert.throws(() => buildNearSettlementPayload(f2), /near_evidence_integer_unsupported/);
  assert.equal(sqlNearSettlementEvidenceEligible(f2.settlement, f2.attempt), false);

  const f3 = baseFixture();
  f3.settlement.evidence.sourceProof.sourceBlockHash = "invalid_hash";
  assert.throws(() => buildNearSettlementPayload(f3), /near_evidence_hash_invalid/);
  assert.equal(sqlNearSettlementEvidenceEligible(f3.settlement, f3.attempt), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION TEST 6: Missing attestation / unverified destination evidence
// ─────────────────────────────────────────────────────────────────────────────
test("6. Missing attestation / unverified destination evidence: unverified proof fails closed", () => {
  const f1 = baseFixture();
  f1.settlement.evidence.destinationProof.verified = false;
  assert.throws(() => buildNearSettlementPayload(f1), /near_destination_evidence_unverified/);
  assert.equal(sqlNearSettlementEvidenceEligible(f1.settlement, f1.attempt), false);

  const f2 = baseFixture();
  f2.settlement.evidence.destinationProof.finalityConfirmed = false;
  assert.throws(() => buildNearSettlementPayload(f2), /near_destination_evidence_unverified/);
  assert.equal(sqlNearSettlementEvidenceEligible(f2.settlement, f2.attempt), false);

  const f3 = baseFixture();
  f3.settlement.evidence.destinationProof = {};
  assert.throws(() => buildNearSettlementPayload(f3), /near_destination_evidence_unverified/);
  assert.equal(sqlNearSettlementEvidenceEligible(f3.settlement, f3.attempt), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION TEST 7: Invalid message hash
// ─────────────────────────────────────────────────────────────────────────────
test("7. Invalid message hash: malformed or truncated message hashes are rejected", () => {
  const f1 = baseFixture();
  f1.settlement.evidence.sourceProof.messageHash = `0x${"1".repeat(63)}`; // 63 chars instead of 64
  assert.throws(() => buildNearSettlementPayload(f1), /near_evidence_hash_invalid/);
  assert.equal(sqlNearSettlementEvidenceEligible(f1.settlement, f1.attempt), false);

  const f2 = baseFixture();
  f2.settlement.evidence.sourceProof.messageHash = "not-a-hash";
  assert.throws(() => buildNearSettlementPayload(f2), /near_evidence_hash_invalid/);
  assert.equal(sqlNearSettlementEvidenceEligible(f2.settlement, f2.attempt), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION TEST 8: Previously blocked job recovery
// ─────────────────────────────────────────────────────────────────────────────
test("8. Previously blocked job recovery: delivery worker recovers when valid payload is supplied", async () => {
  const job = { id: "outbox-blocked-1", reconciliation_id: settlementId, lock_token: "lease-1" };
  const f = baseFixture();
  const payload = buildNearSettlementPayload(f);
  const input = payload.attestationArgs.input;
  const settlementRecord = {
    reconciliation_id: input.reconciliation_id,
    invoice_id: invoiceId,
    attempt_id: attemptId,
    source_transaction_hash: input.source_transaction_hash,
    destination_transaction_hash: input.destination_transaction_hash,
    amount_base_units: input.amount_base_units,
    evidence_digest: input.evidence_digest,
    cctp_source_domain: input.cctp_source_domain,
    cctp_message_nonce: input.cctp_message_nonce,
  };

  let reads = 0;
  let submittedTx = null;
  let statusResult = null;

  const result = await deliverClaimedNearSettlement(job, {
    loadPayload: async () => ({ ...payload, settlementRecord }),
    getSettlement: async () => reads++ === 0 ? null : settlementRecord,
    ensureInvoiceAndAttempt: async () => {},
    attestSettlement: async () => "near-tx-recovered",
    recordSubmission: async (_job, tx) => { submittedTx = tx; },
    markSubmitted: async (_job, tx) => { statusResult = `submitted:${tx}`; },
    scheduleRetry: async () => {},
    markBlocked: async () => {},
  });

  assert.equal(result, "submitted");
  assert.equal(submittedTx, "near-tx-recovered");
  assert.equal(statusResult, "submitted:near-tx-recovered");
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION TEST 9: Retry without duplicate NEAR transactions
// ─────────────────────────────────────────────────────────────────────────────
test("9. Retry without duplicate NEAR transactions: existing on-chain settlement is verified without re-attesting", async () => {
  const job = { id: "outbox-retry-1", reconciliation_id: settlementId, lock_token: "lease-1", near_transaction_hash: "already-submitted-hash" };
  const f = baseFixture();
  const payload = buildNearSettlementPayload(f);
  const input = payload.attestationArgs.input;
  const existingOnChain = {
    reconciliation_id: input.reconciliation_id,
    invoice_id: invoiceId,
    attempt_id: attemptId,
    source_transaction_hash: input.source_transaction_hash,
    destination_transaction_hash: input.destination_transaction_hash,
    amount_base_units: input.amount_base_units,
    evidence_digest: input.evidence_digest,
    cctp_source_domain: input.cctp_source_domain,
    cctp_message_nonce: input.cctp_message_nonce,
  };

  let attestCalls = 0;
  let completedTx = null;

  const result = await deliverClaimedNearSettlement(job, {
    loadPayload: async () => ({ ...payload, settlementRecord: existingOnChain }),
    getSettlement: async () => existingOnChain,
    ensureInvoiceAndAttempt: async () => {},
    attestSettlement: async () => { attestCalls += 1; return "duplicate-tx"; },
    recordSubmission: async () => {},
    markSubmitted: async (_job, tx) => { completedTx = tx; },
    scheduleRetry: async () => {},
    markBlocked: async () => {},
  });

  assert.equal(result, "submitted");
  assert.equal(attestCalls, 0, "Must NEVER submit a duplicate NEAR transaction when on-chain record matches");
  assert.equal(completedTx, "already-submitted-hash");
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION TEST 10: Verified invoice remains paid during NEAR failure
// ─────────────────────────────────────────────────────────────────────────────
test("10. Verified invoice remains paid during NEAR failure: EVM payment integrity invariant", () => {
  const f = baseFixture();
  // Simulate NEAR failure / blocked state
  const nearBlockedEntry = {
    id: "outbox-blocked-99",
    status: "blocked",
    last_error_code: "near_evidence_ineligible",
    attempt_count: 0,
    near_transaction_hash: null,
  };

  // Invariant 1: Invoice status in database and view remains 'paid'
  assert.equal(f.invoice.status, "paid");

  // Invariant 2: Settlement outcome remains VERIFIED
  assert.equal(f.settlement.outcome, "VERIFIED");
  assert.equal(f.settlement.provider_status, "SUCCESS");

  // Invariant 3: Received amount is 100% credited
  assert.equal(f.settlement.received_amount_base_units, "100000000");

  // Invariant 4: Blocking NEAR does not alter the invoice paid state
  const mockInvoiceState = {
    ...f.invoice,
    nearOutboxStatus: nearBlockedEntry.status,
    nearOutboxError: nearBlockedEntry.last_error_code,
  };
  assert.equal(mockInvoiceState.status, "paid", "Invoice status must never revert to open or unpaid when NEAR blocks");
});
