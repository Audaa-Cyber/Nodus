import test from "node:test";
import assert from "node:assert/strict";
import {
  canRetryCircleBridgeResult,
  sanitizeCircleBridgeStep,
} from "../src/lib/payments/circle-bridge-recovery.ts";

test("sanitizes App Kit step events without persisting raw error or wallet data", () => {
  const error = { message: "provider detail" };
  const step = sanitizeCircleBridgeStep({
    name: "burn", state: "error", txHash: `0x${"a".repeat(64)}`,
    error, errorMessage: "provider detail", data: { wallet: "private" },
    errorCategory: "chain_revert", forwarded: false, batched: true,
  });
  assert.deepEqual(step, {
    name: "burn", state: "error", txHash: `0x${"a".repeat(64)}`,
    errorCategory: "chain_revert", forwarded: false, batched: true,
  });
  assert.equal(sanitizeCircleBridgeStep({ name: "burn", state: "error", txHash: "not-a-hash" }), null);
});

test("retries only an actionable pre-burn App Kit failure", () => {
  const retryable = () => true;
  const failedApproval = { state: "error", steps: [
    { name: "approve", state: "error", error: new Error("temporary RPC error") },
  ] };
  assert.equal(canRetryCircleBridgeResult(failedApproval, false, retryable), true);
  assert.equal(canRetryCircleBridgeResult({ ...failedApproval, state: "pending" }, false, retryable), false);
  assert.equal(canRetryCircleBridgeResult({ ...failedApproval, state: "success" }, false, retryable), false);
  assert.equal(canRetryCircleBridgeResult(failedApproval, true, retryable), false);
  assert.equal(canRetryCircleBridgeResult({ state: "error", steps: [
    { name: "burn", state: "success", txHash: `0x${"b".repeat(64)}` },
    { name: "fetchAttestation", state: "error", error: new Error("temporary RPC error") },
  ] }, false, retryable), false);
  assert.equal(canRetryCircleBridgeResult({ state: "error", steps: [
    { name: "approve", state: "error", error: new Error("user rejected") },
  ] }, false, () => false), false);
});
