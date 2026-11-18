import test from "node:test";
import assert from "node:assert/strict";

let progress;
try {
  ({ paymentProgress: progress } = await import("../src/components/wallet/payer-progress.ts"));
} catch {
  // The first run verifies that the new state adapter is still missing.
}

test("payment progress cannot complete from a broadcast hash alone", () => {
  assert.equal(typeof progress, "function", "payment progress adapter exists");
  assert.equal(progress({ stage: "verifying", depositTxHash: "0x123", approvalTxHash: "0x456", direct: false }).current, 2);
  assert.equal(progress({ stage: "verifying", depositTxHash: "0x123", approvalTxHash: "0x456", direct: false }).complete, false);
});

test("direct USDC transfer skips allowance and waits for server verification", () => {
  assert.equal(typeof progress, "function", "payment progress adapter exists");
  const state = progress({ stage: "authorizing", depositTxHash: null, approvalTxHash: null, direct: true });
  assert.equal(state.current, 1);
  assert.equal(state.allowanceRequired, false);
  assert.equal(state.complete, false);
});

test("only settled state completes all progress steps", () => {
  assert.equal(typeof progress, "function", "payment progress adapter exists");
  const state = progress({ stage: "settled", depositTxHash: "0x123", approvalTxHash: null, direct: true });
  assert.equal(state.current, 3);
  assert.equal(state.complete, true);
});
