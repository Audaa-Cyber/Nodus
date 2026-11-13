import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

mock.module("server-only", { defaultExport: {} });

const token = "a".repeat(43);
const attemptId = "123e4567-e89b-42d3-a456-426614174000";
const invoiceId = "inv-uuid-1234-5678-90ab-cdef12345678";
const payer = "0xb35188da23041addaa1c59a4834124996a9f9abf";
const recipient = "0x315eed96725dfbddefcdf35673634cd1eceb9433";
const sourceTxHash = "0xe6b936fb6bbe80082d76e1d38f5583be7b3293d5269fdda4086e436743444e92";
const approvalTxHash = "0xefd85a05c19218f977393c174bac8381e07e7323b21d9c89e46cc951fe1e08af";
const destTxHash = "0x02e270b95ffa6985938ffa2fec2a1ef732593e2fe1d380e0aeaa0869ef32c4c6";

let rpcCalls = [];
let mockAttempt = null;
let mockContext = null;
let mockReceipts = [];
let mockCctpStatus = null;
let mockSourceVerifyResult = null;
let mockSourceVerifyError = null;
let mockDestVerifyResult = null;
let mockDestVerifyError = null;

mock.module(new URL("../src/lib/supabase/admin.ts", import.meta.url).href, {
  namedExports: {
    getSupabaseAdminClient: () => ({
      rpc: async (fn, args) => {
        rpcCalls.push({ fn, args });
        if (fn === "get_shared_live_attempt") return { data: [mockAttempt], error: null };
        if (fn === "lookup_shared_payment_context") return { data: [mockContext], error: null };
        if (fn === "lookup_shared_payment_receipts") return { data: mockReceipts, error: null };
        if (fn === "record_circle_recovery_progress") return { data: null, error: null };
        if (fn === "update_live_attempt_status") return { data: null, error: null };
        if (fn === "record_payment_reconciliation") return { data: { id: "reconciliation-id" }, error: null };
        return { data: null, error: null };
      },
    }),
  },
});

mock.module(new URL("../src/config/env.server.ts", import.meta.url).href, {
  namedExports: { isServerSupabaseConfigured: () => true },
});

mock.module(new URL("../src/lib/server/circle.ts", import.meta.url).href, {
  namedExports: {
    getCircleChain: (net) => ({
      name: net,
      chainId: net.includes("arbitrum") ? 421614 : 84532,
      usdcAddress: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    }),
    fetchCircleCctpStatus: async () => mockCctpStatus,
  },
});

mock.module(new URL("../src/lib/server/cctp-v2-chain.ts", import.meta.url).href, {
  namedExports: {
    verifyCctpV2SourceTransaction: async () => {
      if (mockSourceVerifyError) throw mockSourceVerifyError;
      return mockSourceVerifyResult;
    },
    verifyCctpV2DestinationTransaction: async () => {
      if (mockDestVerifyError) throw mockDestVerifyError;
      return mockDestVerifyResult;
    },
  },
});

mock.module(new URL("../src/lib/server/near-settlement-outbox.ts", import.meta.url).href, {
  namedExports: {
    processNearSettlementOutbox: async () => {},
  },
});

mock.module(new URL("../node_modules/next/server.js", import.meta.url).href, {
  namedExports: {
    NextResponse: {
      json: (body, init = {}) => new Response(JSON.stringify(body), {
        ...init,
        headers: { "Content-Type": "application/json", ...init.headers },
      }),
    },
  },
});

const { GET } = await import("../src/app/api/pay/[token]/attempt/[id]/status/route.ts");

function invoke(t = token, id = attemptId) {
  return GET(new Request("http://localhost/api/pay/status"), {
    params: Promise.resolve({ token: t, id }),
  });
}

function resetFixtures() {
  rpcCalls = [];
  mockContext = {
    invoice_id: invoiceId,
    invoice_status: "open",
    amount_minor: 1000,
    currency: "USD",
  };
  mockAttempt = {
    id: attemptId,
    invoice_id: invoiceId,
    status: "PROCESSING",
    source_network: "base-sepolia",
    source_asset_id: "usdc",
    destination_network: "arbitrum-sepolia",
    destination_asset_id: "usdc",
    recipient_address: recipient,
    payer_address: payer,
    requested_amount: "10085961",
    expected_received_amount: "10000000",
    transaction_hash: sourceTxHash,
    circle_approval_tx_hash: approvalTxHash,
    circle_recovery_state: null,
    quote_snapshot: {
      type: "circle_cctp",
      invoiceId,
      payer,
      recipient,
      minimumReceived: "10000000",
      amountReceived: "10.000000",
      totalDebit: "10.085961",
      feeTotal: "0.085961",
      sourceNetwork: "base-sepolia",
      sourceAssetId: "usdc",
      destinationNetwork: "arbitrum-sepolia",
      destinationAssetId: "usdc",
    },
  };
  mockReceipts = [];
  mockCctpStatus = {
    status: "complete",
    cctpVersion: 2,
    message: "0x" + "aa".repeat(150),
    eventNonce: "12345",
    forwardState: "FORWARD_EXECUTED",
    destinationMintTxHash: destTxHash,
  };
  mockSourceVerifyResult = {
    sourceTransactionHash: sourceTxHash,
    payer,
    amount: "10000000",
    nonce: "12345",
    messageHash: "0x" + "33".repeat(32),
    message: "0x" + "aa".repeat(150),
    messageBody: "0x1234",
    finalityThresholdExecuted: 1000,
    sourceBlockNumber: "57927283",
    sourceBlockHash: "0x" + "44".repeat(32),
  };
  mockSourceVerifyError = null;
  mockDestVerifyResult = {
    verified: true,
    finalityConfirmed: true,
    amount: "10000000",
    transactionHashes: [destTxHash],
  };
  mockDestVerifyError = null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("status route recognizes partial execution with approval only as APPROVAL_CONFIRMED without failing", async () => {
  resetFixtures();
  mockAttempt.transaction_hash = null; // No burn hash yet!
  mockAttempt.circle_approval_tx_hash = approvalTxHash;

  const res = await invoke();
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.pending, true);
  assert.equal(data.recoveryRequired, false);
  assert.equal(data.recoveryState, "APPROVAL_CONFIRMED");
  assert.equal(data.executionStep, "AWAITING_SOURCE_BURN");
  assert.equal(data.sourceTransactionReferenceMissing, true);
  assert.match(data.providerProgress.message, /approval confirmed/i);
});

test("status route handles missing operator RPC as retryable configuration delay, never manual review", async () => {
  resetFixtures();
  mockSourceVerifyError = new Error("cctp_verification_rpc_not_configured");

  const res = await invoke();
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.pending, true);
  assert.equal(data.recoveryRequired, false);
  assert.equal(data.recoveryState, "RETRYABLE_PROVIDER_FAILURE");
  assert.equal(data.failureCode, "operator_rpc_not_configured");
  assert.equal(data.diagnosticInfo.isOperatorConfig, true);
  assert.equal(data.diagnosticInfo.isTransient, true);

  // Database must record AWAITING_VERIFICATION, NOT MANUAL_REVIEW
  const recoveryDbCall = rpcCalls.find((c) => c.fn === "record_circle_recovery_progress");
  assert.ok(recoveryDbCall);
  assert.equal(recoveryDbCall.args.p_state, "AWAITING_VERIFICATION");
});

test("status route handles transient IRIS attestation lookup delay gracefully", async () => {
  resetFixtures();
  mockCctpStatus = {
    status: "pending",
    cctpVersion: 2,
    message: null,
    error: "iris_api_status 502 Bad Gateway",
  };

  const res = await invoke();
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.pending, true);
  assert.equal(data.recoveryRequired, false);
  assert.equal(data.recoveryState, "AWAITING_CIRCLE_ATTESTATION");
  assert.equal(data.executionStep, "AWAITING_CIRCLE_ATTESTATION");

  // Database must record AWAITING_IRIS, NOT MANUAL_REVIEW
  const recoveryDbCall = rpcCalls.find((c) => c.fn === "record_circle_recovery_progress");
  assert.ok(recoveryDbCall);
  assert.equal(recoveryDbCall.args.p_state, "AWAITING_IRIS");
});

test("status route completes destination verification and settles invoice without duplicate burn", async () => {
  resetFixtures();

  const res = await invoke();
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.settled, true);
  assert.equal(data.recoveryState, "DESTINATION_SETTLEMENT_VERIFIED");
  assert.equal(data.executionStep, "SETTLED");
  assert.equal(data.attempt.status, "SUCCESS");

  // Verify that payment reconciliation was recorded
  const recCall = rpcCalls.find((c) => c.fn === "record_payment_reconciliation");
  assert.ok(recCall);
  assert.equal(recCall.args.p_attempt_id, attemptId);
  assert.equal(recCall.args.p_provider_status, "SUCCESS");
  assert.equal(recCall.args.p_destination_network, "arbitrum-sepolia");
  assert.equal(recCall.args.p_recipient_address, recipient);
  assert.equal(recCall.args.p_received_amount_base_units, "10000000");

  // Verify that SETTLED state was recorded
  const settledCall = rpcCalls.filter((c) => c.fn === "record_circle_recovery_progress").pop();
  assert.ok(settledCall);
  assert.equal(settledCall.args.p_state, "SETTLED");
});
