import test from "node:test";
import assert from "node:assert/strict";
import { assetUnitsToInvoiceMinor, classifySettlement } from "../src/lib/payments/settlement-policy.ts";

const recipient = "0x1234567890123456789012345678901234567890";
const tokenContract = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const destinationTxHash = `0x${"a".repeat(64)}`;

function fixture(overrides = {}) {
  const attempt = {
    id: "attempt-1",
    invoice_id: "invoice-1",
    business_id: "business-1",
    mode: "live",
    status: "PROCESSING",
    source_asset_id: "source:asset",
    destination_asset_id: "destination:usdc",
    destination_network: "base",
    recipient_address: recipient,
    deposit_address: "0x9999999999999999999999999999999999999999",
    quote_expires_at: "2026-11-07T12:00:00.000Z",
    transaction_hash: `0x${"b".repeat(64)}`,
    expected_received_amount: "100000000",
    quote_snapshot: {
      quoteRequest: { originAsset: "source:asset", destinationAsset: "destination:usdc", recipient },
      quote: { depositAddress: "0x9999999999999999999999999999999999999999", amountOut: "100000000" },
    },
  };
  const invoice = {
    id: "invoice-1",
    business_id: "business-1",
    status: "open",
    currency: "USD",
    amount_minor: 10000,
  };
  const execution = {
    status: "SUCCESS",
    quoteResponse: {
      quoteRequest: {
        dry: false,
        swapType: "EXACT_OUTPUT",
        originAsset: "source:asset",
        destinationAsset: "destination:usdc",
        amount: "100000000",
        depositType: "ORIGIN_CHAIN",
        recipient,
        recipientType: "DESTINATION_CHAIN",
      },
      quote: {
        depositAddress: attempt.deposit_address,
        amountOut: "100000000",
      },
      signature: "simulated-signature",
      timestamp: "2026-11-07T11:00:00.000Z",
    },
    updatedAt: "2026-11-07T11:30:00.000Z",
    swapDetails: {
      amountOut: "100000000",
      destinationChainTxHashes: [{ hash: destinationTxHash, explorerUrl: "https://example.invalid/tx" }],
    },
  };
  const destinationAsset = {
    assetId: "destination:usdc",
    symbol: "USDC",
    decimals: 6,
    blockchain: "base",
    contractAddress: tokenContract,
  };
  const transferProof = {
    verified: true,
    network: "base",
    contractAddress: tokenContract,
    recipient,
    amount: "100000000",
    transactionHashes: [destinationTxHash],
    finalityConfirmed: true,
  };
  return {
    attempt: { ...attempt, ...overrides.attempt },
    invoice: { ...invoice, ...overrides.invoice },
    execution: { ...execution, ...overrides.execution },
    destinationAsset: { ...destinationAsset, ...overrides.destinationAsset },
    transferProof: { ...transferProof, ...overrides.transferProof },
    quoteSignatureValid: overrides.quoteSignatureValid ?? true,
    now: overrides.now ?? new Date("2026-11-07T11:45:00.000Z"),
  };
}

test("accepts a fully verified exact-output settlement", () => {
  const result = classifySettlement(fixture());
  assert.equal(result.kind, "verified");
  assert.equal(result.outcome, "VERIFIED");
  assert.equal(result.receivedValueMinor, "10000");
});

test("mock SUCCESS stays a simulation and cannot reconcile an invoice", () => {
  const result = classifySettlement(fixture({ attempt: { mode: "mock" } }));
  assert.deepEqual(result, { kind: "simulation", outcome: "SIMULATED_SUCCESS" });
});

test("failed execution is recorded as failed without settlement", () => {
  const result = classifySettlement(fixture({ execution: { status: "FAILED" } }));
  assert.deepEqual(result, { kind: "terminal", outcome: "FAILED", providerStatus: "FAILED" });
});

test("refunded execution is never treated as paid", () => {
  const result = classifySettlement(fixture({ execution: { status: "REFUNDED" } }));
  assert.deepEqual(result, { kind: "terminal", outcome: "REFUNDED", providerStatus: "REFUNDED" });
});

test("incomplete deposit is explicit and non-paid", () => {
  const result = classifySettlement(fixture({ execution: { status: "INCOMPLETE_DEPOSIT" } }));
  assert.deepEqual(result, { kind: "terminal", outcome: "INCOMPLETE_DEPOSIT", providerStatus: "INCOMPLETE_DEPOSIT" });
});

test("underpayment is classified as partial", () => {
  const result = classifySettlement(fixture({
    execution: { swapDetails: { amountOut: "50000000", destinationChainTxHashes: [{ hash: destinationTxHash }] } },
    transferProof: { amount: "50000000" },
  }));
  assert.equal(result.kind, "verified");
  assert.equal(result.outcome, "PARTIAL");
  assert.equal(result.receivedValueMinor, "5000");
});

test("overpayment is classified separately for review", () => {
  const result = classifySettlement(fixture({
    execution: { swapDetails: { amountOut: "100010000", destinationChainTxHashes: [{ hash: destinationTxHash }] } },
    transferProof: { amount: "100010000" },
  }));
  assert.equal(result.kind, "verified");
  assert.equal(result.outcome, "OVERPAID");
  assert.equal(result.receivedValueMinor, "10001");
});

test("wrong recipient fails closed", () => {
  const result = classifySettlement(fixture({ transferProof: { recipient: "0x0000000000000000000000000000000000000001" } }));
  assert.equal(result.kind, "manual_review");
  assert.equal(result.reason, "destination_recipient_mismatch");
});

test("wrong destination token contract fails closed", () => {
  const result = classifySettlement(fixture({ transferProof: { contractAddress: "0x0000000000000000000000000000000000000001" } }));
  assert.equal(result.kind, "manual_review");
  assert.equal(result.reason, "destination_asset_mismatch");
});

test("wrong destination network fails closed", () => {
  const result = classifySettlement(fixture({
    destinationAsset: { blockchain: "ethereum" },
    transferProof: { network: "ethereum" },
  }));
  assert.equal(result.kind, "manual_review");
  assert.equal(result.reason, "destination_network_mismatch");
});

test("expired unpaid attempts are not settled", () => {
  const result = classifySettlement(fixture({
    attempt: { transaction_hash: null, quote_expires_at: "2026-11-07T10:00:00.000Z" },
    execution: { status: "PENDING_DEPOSIT" },
  }));
  assert.deepEqual(result, { kind: "expired" });
});

test("an attempt cannot be reconciled against a different invoice", () => {
  const result = classifySettlement(fixture({ invoice: { id: "other-invoice" } }));
  assert.equal(result.kind, "manual_review");
  assert.equal(result.reason, "invoice_mismatch");
});

test("duplicate provider transaction hashes cannot be used as transfer proof", () => {
  const result = classifySettlement(fixture({
    transferProof: { transactionHashes: [destinationTxHash, destinationTxHash] },
  }));
  assert.equal(result.kind, "manual_review");
  assert.equal(result.reason, "destination_transaction_mismatch");
});

test("invoice and attempt business ownership mismatch fails closed", () => {
  const result = classifySettlement(fixture({ invoice: { business_id: "different-business" } }));
  assert.equal(result.kind, "manual_review");
  assert.equal(result.reason, "business_mismatch");
});

test("invalid quote signatures are rejected before settlement", () => {
  const result = classifySettlement(fixture({ quoteSignatureValid: false }));
  assert.equal(result.kind, "manual_review");
  assert.equal(result.reason, "invalid_provider_signature");
});

test("smallest-unit conversion stays exact without floating point", () => {
  assert.equal(assetUnitsToInvoiceMinor("100000001", 6), "10000.0001");
  assert.equal(assetUnitsToInvoiceMinor("1234", 2), "1234");
  assert.equal(assetUnitsToInvoiceMinor("1", 0), "100");
});

test("an unfinalized destination transfer cannot be reconciled", () => {
  const result = classifySettlement(fixture({ transferProof: { finalityConfirmed: false } }));
  assert.equal(result.kind, "manual_review");
  assert.equal(result.reason, "destination_transfer_unverified");
});

test("unknown provider execution statuses fail closed", () => {
  const result = classifySettlement(fixture({ execution: { status: "SOMETHING_NEW" } }));
  assert.equal(result.kind, "manual_review");
  assert.equal(result.reason, "invalid_provider_status");
});

test("settlement received for a nonpayable invoice is recorded for review, not paid again", () => {
  const result = classifySettlement(fixture({ invoice: { status: "cancelled" } }));
  assert.equal(result.kind, "verified");
  assert.equal(result.outcome, "REVIEW_REQUIRED");
});
