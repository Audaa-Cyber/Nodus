import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverPaymentRoutes,
  invoiceMinorToUsdcBaseUnits,
} from "../src/lib/payments/route-orchestrator.ts";
import {
  getCircleChain,
  isCctpRouteSupported,
  isDirectUsdcTransferSupported,
} from "../src/lib/server/circle.ts";

const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const sender = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

test("exact-output math: invoiceMinorToUsdcBaseUnits converts minor units to 6-decimal USDC base units", () => {
  // $1.00 = 100 cents (minor) -> 1,000,000 base units (6 decimals)
  assert.equal(invoiceMinorToUsdcBaseUnits(100), "1000000");

  // $0.01 = 1 cent -> 10,000 base units
  assert.equal(invoiceMinorToUsdcBaseUnits(1), "10000");

  // $250.50 = 25,050 cents -> 250,500,000 base units
  assert.equal(invoiceMinorToUsdcBaseUnits(25050), "250500000");

  // $10,000.00 = 1,000,000 cents -> 10,000,000,000 base units
  assert.equal(invoiceMinorToUsdcBaseUnits(1000000), "10000000000");

  // Edge cases: 0 and negative minor units return 0 base units
  assert.equal(invoiceMinorToUsdcBaseUnits(0), "0");
  assert.equal(invoiceMinorToUsdcBaseUnits(-50), "0");
});

test("route discovery: same-chain USDC selects circle_direct with zero protocol fee", async () => {
  const result = await discoverPaymentRoutes({
    invoiceId: "inv-test-direct-1",
    amountMinor: 5000, // $50.00
    currency: "USD",
    destinationNetwork: "base",
    recipientAddress: recipient,
    sourceAssetId: "base:usdc",
    sourceNetwork: "base",
    sourceSymbol: "USDC",
    sourceDecimals: 6,
    sourceContractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    senderAddress: sender,
  });

  assert.equal(result.error, undefined);
  assert.ok(result.routes.length >= 1);

  const topRoute = result.routes[0];
  assert.equal(topRoute.provider, "circle_direct");
  assert.equal(topRoute.sourceSymbol, "USDC");
  assert.equal(topRoute.destinationSymbol, "USDC");
  assert.equal(topRoute.requestedAmount, "50000000"); // 50 USDC in 6 decimals ($50.00)
  assert.equal(topRoute.expectedReceivedAmount, "50000000");
  assert.equal(topRoute.minReceivedAmount, "50000000");
  assert.equal(topRoute.coversInvoice, true);
  assert.equal(topRoute.fees.protocolFeeUsd, "0.00");
  assert.equal(topRoute.recipientAddress, recipient);
  assert.equal(topRoute.depositAddress, recipient);
});

test("route discovery: the Phase 1 Base Sepolia to Arbitrum Sepolia pair selects Circle CCTP", async () => {
  const result = await discoverPaymentRoutes({
    invoiceId: "inv-test-cctp-1",
    amountMinor: 2500, // $25.00
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
  assert.ok(cctpRoute, "Circle CCTP route must be discovered");
  assert.equal(cctpRoute.sourceSymbol, "USDC");
  assert.equal(cctpRoute.destinationSymbol, "USDC");
  assert.equal(cctpRoute.requestedAmount, "25000000"); // 25 USDC in 6 decimals ($25.00)
  assert.equal(cctpRoute.expectedReceivedAmount, "25000000");
  assert.equal(cctpRoute.minReceivedAmount, "25000000");
  assert.equal(cctpRoute.coversInvoice, true);
  assert.match(cctpRoute.fees.protocolFeeUsd, /Circle estimate required/);

  const baseCircle = getCircleChain("base-sepolia", true);
  assert.equal(cctpRoute.depositAddress, baseCircle.tokenMessengerAddress);
});

test("route discovery: rejects non-EVM destination networks for MVP", async () => {
  const result = await discoverPaymentRoutes({
    invoiceId: "inv-test-sol-1",
    amountMinor: 1000,
    currency: "USD",
    destinationNetwork: "solana",
    recipientAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    sourceAssetId: "base:usdc",
    sourceNetwork: "base",
    sourceSymbol: "USDC",
    sourceDecimals: 6,
    sourceContractAddress: null,
  });

  assert.equal(result.error, "destination_network_must_be_evm");
  assert.deepEqual(result.routes, []);
});

test("route discovery: rejects unsupported invoice currency", async () => {
  const result = await discoverPaymentRoutes({
    invoiceId: "inv-test-eur-1",
    amountMinor: 1000,
    currency: "EUR",
    destinationNetwork: "base",
    recipientAddress: recipient,
    sourceAssetId: "base:usdc",
    sourceNetwork: "base",
    sourceSymbol: "USDC",
    sourceDecimals: 6,
    sourceContractAddress: null,
  });

  assert.equal(result.error, "unsupported_invoice_currency");
  assert.deepEqual(result.routes, []);
});

test("route expiry: quote expiration timestamp is generated with valid 5-minute TTL", async () => {
  const now = Date.now();
  const result = await discoverPaymentRoutes({
    invoiceId: "inv-test-expiry-1",
    amountMinor: 1000,
    currency: "USD",
    destinationNetwork: "base",
    recipientAddress: recipient,
    sourceAssetId: "base:usdc",
    sourceNetwork: "base",
    sourceSymbol: "USDC",
    sourceDecimals: 6,
    sourceContractAddress: null,
  });

  assert.ok(result.routes.length > 0);
  for (const route of result.routes) {
    const expiresMs = Date.parse(route.quoteExpiresAt);
    assert.ok(Number.isFinite(expiresMs));
    assert.ok(expiresMs > now + 4 * 60 * 1000, "TTL must be greater than 4 minutes in future");
    assert.ok(expiresMs <= now + 5 * 60 * 1000 + 1000, "TTL must not exceed 5 minutes");
  }
});

test("circle support checks: verifies direct and CCTP route capabilities", () => {
  // Direct same-chain transfer
  assert.equal(isDirectUsdcTransferSupported("base", "base", "USDC"), true);
  assert.equal(isDirectUsdcTransferSupported("arbitrum", "arbitrum", "USDC"), true);
  assert.equal(isDirectUsdcTransferSupported("base", "ethereum", "USDC"), false);
  assert.equal(isDirectUsdcTransferSupported("base", "base", "ETH"), false);

  // CCTP mainnet routes
  assert.equal(isCctpRouteSupported("ethereum", "base", false), true);
  assert.equal(isCctpRouteSupported("arbitrum", "optimism", false), true);
  assert.equal(isCctpRouteSupported("base", "ethereum", false), true);

  // CCTP testnet routes
  assert.equal(isCctpRouteSupported("sepolia", "base-sepolia", true), true);
  assert.equal(isCctpRouteSupported("arbitrum-sepolia", "base-sepolia", true), true);

  // Non-supported CCTP routes
  assert.equal(isCctpRouteSupported("bsc", "base", false), false);
});
