import test, { mock } from "node:test";
import assert from "node:assert/strict";

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
let invoiceStatus = "open";
let afterTasks = [];
let nearWorkerCalls = 0;
let nearWorkerError = null;
let directProof = null;
let directError = null;
let reconciliationError = null;
let cctpCalls = 0;

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
        if (fn === "record_payment_reconciliation") {
          if (reconciliationError) return { data: null, error: reconciliationError };
          invoiceStatus = "paid";
          return { data: { id: "reconciliation-id" }, error: null };
        }
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
    fetchCircleCctpStatus: async () => { cctpCalls++; return mockCctpStatus; },
  },
});

mock.module(new URL("../src/lib/server/settlement-chain.ts", import.meta.url).href, {
  namedExports: { verifyEvmDestinationTransfers: async (input) => {
    assert.equal(input.payer, payer);
    assert.equal(input.recipient, recipient);
    assert.equal(input.network, "arc-testnet");
    assert.deepEqual(input.transactionHashes, [sourceTxHash]);
    if (directError) throw directError;
    return directProof;
  } },
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
    processNearSettlementOutbox: async () => {
      nearWorkerCalls += 1;
      if (nearWorkerError) throw nearWorkerError;
    },
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
    after: (task) => { afterTasks.push(task); },
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
  invoiceStatus = "open";
  afterTasks = [];
  nearWorkerCalls = 0;
  nearWorkerError = null;
  directError = null;
  reconciliationError = null;
  cctpCalls = 0;
}

function directFixture() {
  resetFixtures();
  mockAttempt.source_network = mockAttempt.destination_network = "arc-testnet";
  mockAttempt.source_asset_id = mockAttempt.destination_asset_id = "arc-testnet:usdc";
  Object.assign(mockAttempt.quote_snapshot, {
    type: "circle_direct", sourceNetwork: "arc-testnet", destinationNetwork: "arc-testnet",
    sourceAssetId: "arc-testnet:usdc", destinationAssetId: "arc-testnet:usdc",
  });
  directProof = { verified: true, finalityConfirmed: true, amount: "10000000", transactionHashes: [sourceTxHash] };
}

test("A/H: Arc direct settlement uses independent evidence and dispatches NEAR after settlement", async () => {
  directFixture();
  const data = await (await invoke()).json();
  assert.equal(data.settled, true);
  assert.equal(invoiceStatus, "paid");
  assert.equal(cctpCalls, 0);
  const call = rpcCalls.find((c) => c.fn === "record_payment_reconciliation");
  assert.equal(call.args.p_evidence.routeType, "same_chain");
  assert.equal(call.args.p_evidence.sourceProof, undefined);
  assert.equal(nearWorkerCalls, 0);
  assert.equal(afterTasks.length, 1);
  nearWorkerError = new Error("NEAR unavailable");
  await afterTasks[0]();
  assert.equal(nearWorkerCalls, 1);
  assert.equal(invoiceStatus, "paid");
});

test("E: invalid, underfunded, pending and unfinalized direct evidence cannot pay invoice", async () => {
  for (const mutate of [
    () => { directError = new Error("destination_transfer_event_count_mismatch"); },
    () => { directError = new Error("TransactionReceiptNotFoundError"); },
    () => { directProof.verified = false; },
    () => { directProof.finalityConfirmed = false; },
  ]) {
    directFixture(); mutate();
    const data = await (await invoke()).json();
    assert.notEqual(data.settled, true);
    assert.equal(invoiceStatus, "open");
    assert.equal(afterTasks.length, 0);
    assert.equal(rpcCalls.some((c) => c.fn === "record_payment_reconciliation"), false);
  }
});

test("F: database duplicate-transaction rejection cannot produce direct success or NEAR dispatch", async () => {
  directFixture();
  reconciliationError = { code: "23505", message: "duplicate transaction" };
  const data = await (await invoke()).json();
  assert.notEqual(data.settled, true);
  assert.equal(invoiceStatus, "open");
  assert.equal(afterTasks.length, 0);
});

test("verified direct attempt remains settled when the invoice is already paid", async () => {
  directFixture();
  mockAttempt.status = "SUCCESS";
  mockContext.invoice_status = "paid";
  mockReceipts = [{ receipt_number: "NOD-2026-00000001" }];
  const data = await (await invoke()).json();
  assert.equal(data.settled, true);
  assert.deepEqual(data.receipts, mockReceipts);
  assert.equal(data.recoveryRequired, undefined);
  assert.equal(cctpCalls, 0);
  assert.equal(rpcCalls.some((call) => call.fn === "record_circle_recovery_progress"), false);
  assert.equal(rpcCalls.some((call) => call.fn === "record_payment_reconciliation"), false);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("approval-only execution requires review without claiming chain confirmation or enabling authorization", async () => {
  resetFixtures();
  mockAttempt.transaction_hash = null; // No burn hash yet!
  mockAttempt.circle_approval_tx_hash = approvalTxHash;

  const res = await invoke();
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.pending, true);
  assert.equal(data.recoveryRequired, true);
  assert.equal(data.recoveryState, "APPROVAL_REFERENCE_SAVED");
  assert.equal(data.executionStep, "RECOVERY_REQUIRED");
  assert.equal(data.sourceTransactionReferenceMissing, true);
  assert.match(data.providerProgress.message, /approval reference is saved/i);
  assert.doesNotMatch(data.providerProgress.message, /confirmed|ready to authorize/i);
  assert.equal(rpcCalls.some((call) => call.fn === "update_live_attempt_status"), false);
});

test("reserved attempt with no references remains blocked without expiring or resetting execution", async () => {
  resetFixtures();
  mockAttempt.transaction_hash = null;
  mockAttempt.circle_approval_tx_hash = null;
  mockAttempt.circle_execution_reserved_at = "2026-11-16T21:09:44.449116Z";
  mockAttempt.quote_expires_at = "2026-01-01T00:00:00Z";
  const res = await invoke();
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.attempt.status, "PROCESSING");
  assert.equal(data.recoveryRequired, true);
  assert.equal(data.sourceTransactionReferenceMissing, true);
  assert.equal(data.executionStep, "RECOVERY_REQUIRED");
  assert.equal(data.recoveryState, "TRANSACTION_REFERENCE_MISSING");
  assert.match(data.providerProgress.message, /do not authorize another payment/i);
  assert.deepEqual(rpcCalls.map((call) => call.fn), ["get_shared_live_attempt", "lookup_shared_payment_context"]);
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

test("verified payment returns paid before post-response NEAR work and NEAR failure cannot undo it", async () => {
  resetFixtures();
  nearWorkerError = new Error("simulated NEAR RPC failure");

  const res = await invoke();
  const data = await res.json();
  assert.equal(data.settled, true);
  assert.equal(invoiceStatus, "paid");
  assert.equal(nearWorkerCalls, 0, "NEAR work must not delay the verified payment response");
  assert.equal(afterTasks.length, 1, "prompt worker dispatch is registered after durable outbox commit");
  assert.ok(rpcCalls.find((call) => call.fn === "record_payment_reconciliation"));

  await afterTasks[0]();
  assert.equal(nearWorkerCalls, 1);
  assert.equal(invoiceStatus, "paid", "NEAR failure must not change verified invoice status");
});
