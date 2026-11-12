import test from "node:test";
import assert from "node:assert/strict";
import { deliverClaimedNearSettlement } from "../src/lib/payments/near-outbox-delivery.ts";

const job = { id: "outbox-1", reconciliation_id: "settlement-1", lock_token: "lease-1" };
const input = {
  reconciliation_id: "settlement-1",
  attempt_id: "attempt-1",
  invoice_id: "invoice-1",
  source_transaction_hash: `0x${"1".repeat(64)}`,
  destination_transaction_hash: `0x${"2".repeat(64)}`,
  amount_base_units: "100000000",
  evidence_digest: `0x${"3".repeat(64)}`,
};
const settlementRecord = {
  reconciliation_id: input.reconciliation_id,
  invoice_id: input.invoice_id,
  attempt_id: input.attempt_id,
  source_transaction_hash: input.source_transaction_hash,
  destination_transaction_hash: input.destination_transaction_hash,
  amount_base_units: input.amount_base_units,
  evidence_digest: input.evidence_digest,
};
const record = (overrides = {}) => ({
  reconciliation_id: input.reconciliation_id,
  invoice_id: input.invoice_id,
  attempt_id: input.attempt_id,
  source_transaction_hash: input.source_transaction_hash,
  destination_transaction_hash: input.destination_transaction_hash,
  amount_base_units: input.amount_base_units,
  evidence_digest: input.evidence_digest,
  ...overrides,
});

function dependencies(overrides = {}) {
  return {
    loadPayload: async () => ({ invoiceArgs: {}, attemptArgs: {}, attestationArgs: { input }, settlementRecord }),
    getSettlement: async () => null,
    ensureInvoiceAndAttempt: async () => {},
    attestSettlement: async () => "near-tx-1",
    markSubmitted: async () => {},
    scheduleRetry: async () => {},
    markBlocked: async () => {},
    ...overrides,
  };
}

test("reconciles an existing matching settlement without submitting a duplicate", async () => {
  let sends = 0;
  let completed = 0;
  const result = await deliverClaimedNearSettlement(job, dependencies({
    getSettlement: async () => record(),
    attestSettlement: async () => { sends += 1; return "unexpected"; },
    markSubmitted: async (_job, txHash) => { assert.equal(txHash, null); completed += 1; },
  }));
  assert.equal(result, "submitted");
  assert.equal(sends, 0);
  assert.equal(completed, 1);
});

test("synchronizes invoice and attempt before attestation", async () => {
  const calls = [];
  const result = await deliverClaimedNearSettlement(job, dependencies({
    ensureInvoiceAndAttempt: async () => { calls.push("registry"); },
    attestSettlement: async () => { calls.push("attest"); return "near-tx-1"; },
    markSubmitted: async (_job, txHash) => { calls.push(`submitted:${txHash}`); },
  }));
  assert.equal(result, "submitted");
  assert.deepEqual(calls, ["registry", "attest", "submitted:near-tx-1"]);
});

test("recovers an uncertain submission by querying get_settlement before retry", async () => {
  let calls = 0;
  let completed = 0;
  let retried = 0;
  const result = await deliverClaimedNearSettlement(job, dependencies({
    getSettlement: async () => calls++ === 0 ? null : record(),
    attestSettlement: async () => { throw new Error("rpc timeout after broadcast"); },
    markSubmitted: async (_job, txHash) => { assert.equal(txHash, null); completed += 1; },
    scheduleRetry: async () => { retried += 1; },
  }));
  assert.equal(result, "submitted");
  assert.equal(calls, 2);
  assert.equal(completed, 1);
  assert.equal(retried, 0);
});

test("leaves a failed submission retryable when get_settlement is still empty", async () => {
  let sends = 0;
  let retried = 0;
  const deps = dependencies({
    attestSettlement: async () => { sends += 1; throw new Error("rpc unavailable"); },
    scheduleRetry: async (_job, code) => { assert.equal(code, "near_submission_uncertain"); retried += 1; },
  });
  assert.equal(await deliverClaimedNearSettlement(job, deps), "retry");
  assert.equal(await deliverClaimedNearSettlement(job, deps), "retry");
  assert.equal(sends, 2);
  assert.equal(retried, 2);
});

test("blocks a conflicting on-chain record and never resubmits it", async () => {
  let sends = 0;
  let blocked = 0;
  const result = await deliverClaimedNearSettlement(job, dependencies({
    getSettlement: async () => record({ amount_base_units: "999" }),
    attestSettlement: async () => { sends += 1; return "unexpected"; },
    markBlocked: async (_job, code) => { assert.equal(code, "near_existing_settlement_mismatch"); blocked += 1; },
  }));
  assert.equal(result, "blocked");
  assert.equal(sends, 0);
  assert.equal(blocked, 1);
});

test("does not submit while get_settlement is unavailable", async () => {
  let sends = 0;
  let retried = 0;
  const result = await deliverClaimedNearSettlement(job, dependencies({
    getSettlement: async () => { throw new Error("rpc timeout"); },
    attestSettlement: async () => { sends += 1; return "unexpected"; },
    scheduleRetry: async () => { retried += 1; },
  }));
  assert.equal(result, "retry");
  assert.equal(sends, 0);
  assert.equal(retried, 1);
});
