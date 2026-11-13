import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("server-only", { defaultExport: {} });

const {
  canRetryCircleBridgeResult,
  sanitizeCircleBridgeStep,
} = await import("../src/lib/payments/circle-bridge-recovery.ts");

const { checkCctpCorridorReadiness } = await import("../src/lib/server/cctp-v2-chain.ts");

// ---------------------------------------------------------------------------
// 1. Corridor Configuration Readiness
// ---------------------------------------------------------------------------

test("checkCctpCorridorReadiness detects fully ready corridor", () => {
  const origRpc = process.env.SETTLEMENT_RPC_URLS_JSON;
  const origConf = process.env.SETTLEMENT_CONFIRMATIONS_JSON;
  try {
    process.env.SETTLEMENT_RPC_URLS_JSON = JSON.stringify({
      "base-sepolia": "https://sepolia.base.org",
      "arbitrum-sepolia": "https://sepolia-rollup.arbitrum.io/rpc",
    });
    process.env.SETTLEMENT_CONFIRMATIONS_JSON = JSON.stringify({
      "arbitrum-sepolia": 2,
    });

    const result = checkCctpCorridorReadiness("base-sepolia", "arbitrum-sepolia");
    assert.equal(result.ready, true);
    assert.equal(result.sourceRpcConfigured, true);
    assert.equal(result.destinationRpcConfigured, true);
    assert.equal(result.confirmationsConfigured, true);
    assert.equal(result.requiredConfirmations, 2);
    assert.equal(result.reason, undefined);
  } finally {
    process.env.SETTLEMENT_RPC_URLS_JSON = origRpc;
    process.env.SETTLEMENT_CONFIRMATIONS_JSON = origConf;
  }
});

test("checkCctpCorridorReadiness flags missing source RPC as configuration error", () => {
  const origRpc = process.env.SETTLEMENT_RPC_URLS_JSON;
  const origConf = process.env.SETTLEMENT_CONFIRMATIONS_JSON;
  try {
    process.env.SETTLEMENT_RPC_URLS_JSON = JSON.stringify({
      "arbitrum-sepolia": "https://sepolia-rollup.arbitrum.io/rpc",
    });
    process.env.SETTLEMENT_CONFIRMATIONS_JSON = JSON.stringify({
      "arbitrum-sepolia": 2,
    });

    const result = checkCctpCorridorReadiness("base-sepolia", "arbitrum-sepolia");
    assert.equal(result.ready, false);
    assert.equal(result.sourceRpcConfigured, false);
    assert.equal(result.destinationRpcConfigured, true);
    assert.match(result.reason, /source network base-sepolia/);
  } finally {
    process.env.SETTLEMENT_RPC_URLS_JSON = origRpc;
    process.env.SETTLEMENT_CONFIRMATIONS_JSON = origConf;
  }
});

test("checkCctpCorridorReadiness flags missing destination confirmations", () => {
  const origRpc = process.env.SETTLEMENT_RPC_URLS_JSON;
  const origConf = process.env.SETTLEMENT_CONFIRMATIONS_JSON;
  try {
    process.env.SETTLEMENT_RPC_URLS_JSON = JSON.stringify({
      "base-sepolia": "https://sepolia.base.org",
      "arbitrum-sepolia": "https://sepolia-rollup.arbitrum.io/rpc",
    });
    process.env.SETTLEMENT_CONFIRMATIONS_JSON = JSON.stringify({});

    const result = checkCctpCorridorReadiness("base-sepolia", "arbitrum-sepolia");
    assert.equal(result.ready, false);
    assert.equal(result.confirmationsConfigured, false);
    assert.match(result.reason, /confirmations count/);
  } finally {
    process.env.SETTLEMENT_RPC_URLS_JSON = origRpc;
    process.env.SETTLEMENT_CONFIRMATIONS_JSON = origConf;
  }
});

// ---------------------------------------------------------------------------
// 2. Circle App Kit Bridge Recovery & No Duplicate Burn
// ---------------------------------------------------------------------------

test("App Kit recovery allows retry of actionable pre-burn failures", () => {
  const approvalFailure = {
    state: "error",
    steps: [
      { name: "approve", state: "error", error: new Error("temporary RPC timeout") },
    ],
  };

  // Pre-burn failure with no burn hash recorded: actionable retry is allowed
  assert.equal(canRetryCircleBridgeResult(approvalFailure, false, () => true), true);

  // User rejection: NOT retryable automatically
  assert.equal(canRetryCircleBridgeResult(approvalFailure, false, () => false), false);
});

test("App Kit recovery strictly forbids duplicate burn if burn hash is present", () => {
  const postBurnFailure = {
    state: "error",
    steps: [
      { name: "approve", state: "success", txHash: "0x" + "1".repeat(64) },
      { name: "burn", state: "success", txHash: "0x" + "2".repeat(64) },
      { name: "fetchAttestation", state: "error", error: new Error("attestation timeout") },
    ],
  };

  // Has source burn: kit.retryBridge or kit.bridge MUST NEVER be called
  assert.equal(canRetryCircleBridgeResult(postBurnFailure, true, () => true), false);
  assert.equal(canRetryCircleBridgeResult(postBurnFailure, false, () => true), false);
});

test("sanitizes SDK steps without leaking error objects or wallet state", () => {
  const dirtyStep = {
    name: "burn",
    state: "success",
    txHash: "0x" + "a".repeat(64),
    error: new Error("secret details"),
    errorMessage: "secret details",
    data: { privateKey: "0x1234" },
    errorCategory: "transient",
    forwarded: false,
    batched: true,
  };

  const clean = sanitizeCircleBridgeStep(dirtyStep);
  assert.deepEqual(clean, {
    name: "burn",
    state: "success",
    txHash: "0x" + "a".repeat(64),
    errorCategory: "transient",
    forwarded: false,
    batched: true,
  });
  assert.equal(clean.error, undefined);
  assert.equal(clean.data, undefined);
});
