import test from "node:test";
import assert from "node:assert/strict";

const { buildPaymentRoutesRequest } = await import("../src/lib/payments/route-request.ts");
const { discoverPaymentRoutes } = await import("../src/lib/payments/route-orchestrator.ts");
const { getCircleChain } = await import("../src/lib/server/circle.ts");

const baseSepoliaUsdc = {
  assetId: "base-sepolia:usdc",
  symbol: "USDC",
  decimals: 6,
  network: { key: "base-sepolia", label: "Base Sepolia", family: "evm", chainId: 84532 },
  contractAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};
const payer = "0x1111111111111111111111111111111111111111";

test("Base Sepolia to Arbitrum Sepolia route request matches Circle validation inputs", async () => {
  // Both wallet methods use LivePaymentFlow; they must serialize one shared asset mapping.
  const circleRequest = buildPaymentRoutesRequest(baseSepoliaUsdc, payer);
  const externalRequest = buildPaymentRoutesRequest(baseSepoliaUsdc, payer);
  const expected = {
    sourceAssetId: "base-sepolia:usdc",
    sourceNetwork: "base-sepolia",
    sourceSymbol: "USDC",
    sourceDecimals: 6,
    sourceContractAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    senderAddress: payer,
  };
  assert.deepEqual(circleRequest, expected);
  assert.deepEqual(externalRequest, expected);

  const source = getCircleChain(circleRequest.sourceNetwork, true);
  const destination = getCircleChain("arbitrum-sepolia", true);
  assert.ok(source);
  assert.ok(destination);
  assert.equal(circleRequest.sourceAssetId, `${circleRequest.sourceNetwork}:usdc`);
  assert.equal(circleRequest.sourceSymbol, "USDC");
  assert.equal(circleRequest.sourceDecimals, 6);
  assert.equal(circleRequest.sourceContractAddress.toLowerCase(), source.usdcAddress.toLowerCase());

  const result = await discoverPaymentRoutes({
    invoiceId: "test-invoice",
    amountMinor: 1000,
    currency: "USD",
    destinationNetwork: "arbitrum-sepolia",
    recipientAddress: "0x2222222222222222222222222222222222222222",
    ...circleRequest,
    isTestnet: true,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.routes.length, 1);
  assert.equal(result.routes[0].provider, "circle_cctp");
  assert.equal(result.routes[0].sourceNetwork, "base-sepolia");
  assert.equal(result.routes[0].destinationNetwork, "arbitrum-sepolia");
});
