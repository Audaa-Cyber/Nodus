import test from "node:test";
import assert from "node:assert/strict";

// We extract the classification logic and test both synthetic error instances and viem-style errors
function isPendingOrTransientError(error) {
  if (!error) return false;
  const detail = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /transactionreceiptnotfound|transactionnotfound|blocknotfound|receipt.*(?:not found|could not be found)|could not be found|fetch failed|http request failed|timeout|timed out|network|connection|rate limit|too many requests|econnreset|etimedout|socket/i.test(detail);
}

function classifyVerificationFailure(error, forwardState = "PENDING") {
  const isTransient = isPendingOrTransientError(error);
  const isExplicitFailure = forwardState === "FAILED";
  const recoveryState = isExplicitFailure || !isTransient
    ? "MANUAL_REVIEW" : "AWAITING_VERIFICATION";
  return {
    recoveryState,
    recoveryRequired: recoveryState === "MANUAL_REVIEW",
    verificationPending: true,
  };
}

test("TransactionReceiptNotFoundError is classified as pending/awaiting verification", () => {
  const err = new Error('Transaction receipt with hash "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" could not be found.');
  err.name = "TransactionReceiptNotFoundError";

  assert.equal(isPendingOrTransientError(err), true);
  const result = classifyVerificationFailure(err);
  assert.equal(result.recoveryState, "AWAITING_VERIFICATION");
  assert.equal(result.recoveryRequired, false);
});

test("TransactionNotFoundError is classified as pending/awaiting verification", () => {
  const err = new Error('Transaction with hash "0x1234" could not be found.');
  err.name = "TransactionNotFoundError";

  assert.equal(isPendingOrTransientError(err), true);
  const result = classifyVerificationFailure(err);
  assert.equal(result.recoveryState, "AWAITING_VERIFICATION");
  assert.equal(result.recoveryRequired, false);
});

test("BlockNotFoundError is classified as pending/awaiting verification", () => {
  const err = new Error("Block could not be found.");
  err.name = "BlockNotFoundError";

  assert.equal(isPendingOrTransientError(err), true);
  const result = classifyVerificationFailure(err);
  assert.equal(result.recoveryState, "AWAITING_VERIFICATION");
  assert.equal(result.recoveryRequired, false);
});

test("Transient network and timeout errors remain awaiting verification", () => {
  for (const msg of [
    "fetch failed",
    "HTTP request failed",
    "Request timed out",
    "ETIMEDOUT",
    "ECONNRESET",
    "rate limit exceeded",
    "too many requests",
  ]) {
    const err = new Error(msg);
    assert.equal(isPendingOrTransientError(err), true, `expected "${msg}" to be transient`);
    const result = classifyVerificationFailure(err);
    assert.equal(result.recoveryState, "AWAITING_VERIFICATION");
    assert.equal(result.recoveryRequired, false);
  }
});

test("Fatal verification errors trigger MANUAL_REVIEW", () => {
  for (const msg of [
    "destination_recipient_mismatch",
    "cctp_source_payer_or_fee_wrapper_mismatch",
    "cctp_source_transaction_failed_or_wrong_chain",
    "cctp_source_debit_mismatch",
    "iris_cctp_nonce_mismatch",
    "destination_amount_conversion_failed",
    "destination_transfer_event_count_mismatch",
  ]) {
    const err = new Error(msg);
    assert.equal(isPendingOrTransientError(err), false, `expected "${msg}" to NOT be transient`);
    const result = classifyVerificationFailure(err);
    assert.equal(result.recoveryState, "MANUAL_REVIEW");
    assert.equal(result.recoveryRequired, true);
  }
});

test("Explicit Circle forwardState FAILED triggers MANUAL_REVIEW even on transient error", () => {
  const err = new Error("Transaction receipt could not be found.");
  err.name = "TransactionReceiptNotFoundError";

  const result = classifyVerificationFailure(err, "FAILED");
  assert.equal(result.recoveryState, "MANUAL_REVIEW");
  assert.equal(result.recoveryRequired, true);
});
