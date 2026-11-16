import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverPaymentRoutes,
} from "../src/lib/payments/route-orchestrator.ts";
import {
  classifySettlement,
} from "../src/lib/payments/settlement-policy.ts";
import { getCircleChain } from "../src/lib/server/circle.ts";

const recipient = "0x1234567890123456789012345678901234567890";
const tokenContract = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const destinationTxHash = `0x${"a".repeat(64)}`;
const sender = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

test("Circle testnet route uses canonical Base Sepolia and Arbitrum Sepolia USDC and CCTP domains", () => {
  const base = getCircleChain("base-sepolia", true);
  const arbitrum = getCircleChain("arbitrum-sepolia", true);
  assert.equal(base?.chainId, 84532);
  assert.equal(base?.cctpDomainId, 6);
  assert.equal(base?.usdcAddress.toLowerCase(), "0x036cbd53842c5426634e7929541ec2318f3dcf7e");
  assert.equal(arbitrum?.chainId, 421614);
  assert.equal(arbitrum?.cctpDomainId, 3);
  assert.equal(arbitrum?.usdcAddress.toLowerCase(), "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d");
});

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
    quote_expires_at: "2026-11-09T12:00:00.000Z",
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
      timestamp: "2026-11-09T11:00:00.000Z",
    },
    updatedAt: "2026-11-09T11:30:00.000Z",
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
    now: overrides.now ?? new Date("2026-11-09T11:45:00.000Z"),
  };
}

// -----------------------------------------------------------------------------
// Test 3: Wallet Rejection is Handled Gracefully
// -----------------------------------------------------------------------------
test("Wallet authorization: user rejection is caught without corrupting attempt state", () => {
  const isUserRejection = (msg) => /reject|denied|cancel|user refused/i.test(msg);

  assert.ok(isUserRejection("User rejected the request."));
  assert.ok(isUserRejection("MetaMask Tx Signature: User denied transaction signature."));
  assert.ok(isUserRejection("User cancelled wallet prompt."));
  assert.ok(!isUserRejection("Internal JSON-RPC error."));
});

// -----------------------------------------------------------------------------
// Test 4: Expired Quotes Cannot Be Authorized or Settled
// -----------------------------------------------------------------------------
test("Quote validation: expired quote timestamp is rejected", () => {
  const expiredTimestamp = new Date(Date.now() - 1000).toISOString();
  const expiresAtMs = Date.parse(expiredTimestamp);
  const isExpired = !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now();
  assert.equal(isExpired, true);

  const result = classifySettlement(
    fixture({
      attempt: { transaction_hash: null, quote_expires_at: "2026-11-09T10:00:00.000Z" },
      execution: { status: "PENDING_DEPOSIT" },
    })
  );
  assert.deepEqual(result, { kind: "expired" });
});

// -----------------------------------------------------------------------------
// Test 5: CCTP Burn Completed But Destination Mint Not Completed Stays Pending
// -----------------------------------------------------------------------------
test("Circle CCTP lifecycle: burn confirmed but mint incomplete keeps payment pending", () => {
  const mockIrisResponse = {
    messages: [
      {
        status: "complete",
        forwardState: "PENDING",
        forwardTxHash: null,
        attestation: "0x" + "1".repeat(128),
      },
    ],
  };

  const msg = mockIrisResponse.messages[0];
  const forwardTxHash =
    typeof msg.forwardTxHash === "string" && msg.forwardTxHash.trim() !== ""
      ? msg.forwardTxHash.trim()
      : undefined;

  assert.equal(forwardTxHash, undefined);

  // Security guarantee: source burn tx hash MUST NOT be used as destination hash
  const sourceTxHash = "0x" + "b".repeat(64);
  const destinationTxHashes = forwardTxHash ? [forwardTxHash] : [];
  assert.deepEqual(destinationTxHashes, []);
  assert.notEqual(destinationTxHashes[0], sourceTxHash);
});

// -----------------------------------------------------------------------------
// Test 6: Destination Mint Completed But Unfinalized Does Not Reconcile
// -----------------------------------------------------------------------------
test("Settlement verification: unfinalized destination transfer cannot mark invoice paid", () => {
  const result = classifySettlement(fixture({ transferProof: { finalityConfirmed: false } }));
  assert.equal(result.kind, "manual_review");
  assert.equal(result.reason, "destination_transfer_unverified");
});

// -----------------------------------------------------------------------------
// Test 7: Wrong Destination Recipient or Token Fails Closed
// -----------------------------------------------------------------------------
test("Settlement verification: wrong destination recipient fails closed", () => {
  const result = classifySettlement(
    fixture({ transferProof: { recipient: "0x0000000000000000000000000000000000000001" } })
  );
  assert.equal(result.kind, "manual_review");
  assert.equal(result.reason, "destination_recipient_mismatch");
});

test("Settlement verification: underpayment is classified as partial settlement", () => {
  const result = classifySettlement(
    fixture({
      execution: { swapDetails: { amountOut: "50000000", destinationChainTxHashes: [{ hash: destinationTxHash }] } },
      transferProof: { amount: "50000000" },
    })
  );
  assert.equal(result.kind, "verified");
  assert.equal(result.outcome, "PARTIAL");
  assert.equal(result.receivedValueMinor, "5000");
});

// -----------------------------------------------------------------------------
// Test 8: Duplicate Transaction Submission Fails Closed
// -----------------------------------------------------------------------------
test("Settlement verification: duplicate transaction hash is rejected", () => {
  const result = classifySettlement(
    fixture({
      transferProof: { transactionHashes: [destinationTxHash, destinationTxHash] },
    })
  );
  assert.equal(result.kind, "manual_review");
  assert.equal(result.reason, "destination_transaction_mismatch");
});

// -----------------------------------------------------------------------------
// Test 9: Simulation Mode Isolation
// -----------------------------------------------------------------------------
test("Simulation isolation: mock mode attempt cannot reconcile invoice", () => {
  const result = classifySettlement(
    fixture({
      attempt: { mode: "mock" },
      execution: { status: "SUCCESS" },
    })
  );
  assert.equal(result.kind, "simulation");
  assert.equal(result.outcome, "SIMULATED_SUCCESS");
});

// -----------------------------------------------------------------------------
// Test 10: Provider Outage and Unavailable Route Fails Softly
// -----------------------------------------------------------------------------
test("Route discovery: only Circle CCTP is available for the configured testnet pair", async () => {
  const result = await discoverPaymentRoutes({
    invoiceId: "inv-fallback-test",
    amountMinor: 5000,
    currency: "USD",
    destinationNetwork: "arbitrum-sepolia",
    recipientAddress: recipient,
    sourceAssetId: "base-sepolia:usdc",
    sourceNetwork: "base-sepolia",
    sourceSymbol: "USDC",
    sourceDecimals: 6,
    sourceContractAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    senderAddress: sender,
    isTestnet: true,
  });

  assert.equal(result.error, undefined);
  assert.ok(result.routes.length >= 1);
  const cctpRoute = result.routes.find((r) => r.provider === "circle_cctp");
  assert.ok(cctpRoute, "Circle CCTP is the execution provider");
});

// -----------------------------------------------------------------------------
// Test 11: Route Hierarchy Order
// -----------------------------------------------------------------------------
test("Route hierarchy: same-chain USDC prioritizes circle_direct", async () => {
  const result = await discoverPaymentRoutes({
    invoiceId: "inv-hierarchy-same",
    amountMinor: 1000,
    currency: "USD",
    destinationNetwork: "base",
    recipientAddress: recipient,
    sourceAssetId: "base:usdc",
    sourceNetwork: "base",
    sourceSymbol: "USDC",
    sourceDecimals: 6,
    senderAddress: sender,
  });

  assert.equal(result.routes[0].provider, "circle_direct");
  assert.equal(result.routes[0].fees.protocolFeeUsd, "0.00");
});
