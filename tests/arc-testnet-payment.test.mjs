import assert from "node:assert/strict";
import { mock, test } from "node:test";

mock.module("server-only", { defaultExport: {} });

const {
  arcTestnetChain,
  circleTestnetUsdcNetworks,
  getCircleTestnetUsdcNetworkForChainId,
  getWalletNetwork,
  getEvmWalletNetwork,
  evmWalletChains,
} = await import("../src/lib/wallet/networks.ts");

const {
  getCircleChain,
  isCctpRouteSupported,
  isDirectUsdcTransferSupported,
} = await import("../src/lib/server/circle.ts");

const {
  discoverPaymentRoutes,
} = await import("../src/lib/payments/route-orchestrator.ts");

const { checkCctpCorridorReadiness } = await import("../src/lib/server/cctp-v2-chain.ts");

const MERCHANT_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const SENDER_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ARC_USDC_CONTRACT = "0x3600000000000000000000000000000000000000";
const ARC_TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
const ARC_MESSAGE_TRANSMITTER = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";

test("Step 1: Arc Testnet chain configuration conforms to Circle specifications", () => {
  assert.equal(arcTestnetChain.id, 5042002);
  assert.equal(arcTestnetChain.name, "Arc Testnet");
  assert.equal(arcTestnetChain.nativeCurrency.name, "USDC");
  assert.equal(arcTestnetChain.nativeCurrency.symbol, "USDC");
  assert.equal(arcTestnetChain.nativeCurrency.decimals, 18);
  assert.equal(arcTestnetChain.rpcUrls.default.http[0], "https://rpc.testnet.arc.network");
  assert.equal(arcTestnetChain.blockExplorers?.default?.url, "https://testnet.arcscan.app");

  // Included in evmWalletChains
  assert.ok(evmWalletChains.some((c) => c.id === 5042002));

  // Included in circleTestnetUsdcNetworks
  const arcNetwork = circleTestnetUsdcNetworks.find((n) => n.key === "arc-testnet");
  assert.ok(arcNetwork, "arc-testnet must be in circleTestnetUsdcNetworks");
  assert.equal(arcNetwork?.chainId, 5042002);
  assert.equal(arcNetwork?.label, "Arc Testnet");

  // Lookup helpers
  assert.equal(getCircleTestnetUsdcNetworkForChainId(5042002)?.key, "arc-testnet");
  assert.equal(getWalletNetwork("arc-testnet")?.chainId, 5042002);
  assert.equal(getWalletNetwork("arc")?.chainId, 5042002);
  assert.equal(getWalletNetwork("arc_testnet")?.chainId, 5042002);
  assert.equal(getEvmWalletNetwork(5042002)?.key, "arc-testnet");
});

test("Step 1 & 2: Circle server chain info resolves Arc Testnet contracts and CCTP domain 26", () => {
  const chainInfo = getCircleChain("arc-testnet", true);
  assert.ok(chainInfo, "Arc Testnet must resolve in Circle testnet chain table");
  assert.equal(chainInfo?.chainId, 5042002);
  assert.equal(chainInfo?.cctpDomainId, 26);
  assert.equal(chainInfo?.usdcAddress.toLowerCase(), ARC_USDC_CONTRACT.toLowerCase());
  assert.equal(chainInfo?.tokenMessengerAddress.toLowerCase(), ARC_TOKEN_MESSENGER.toLowerCase());
  assert.equal(chainInfo?.messageTransmitterV2?.toLowerCase(), ARC_MESSAGE_TRANSMITTER.toLowerCase());
  // Arc supports Circle's upfront-fee wrapper for Standard Transfer, but not Fast Transfer.
  assert.equal(chainInfo?.supportsFastTransfer, false);
  assert.equal(chainInfo?.tokenMessengerWithFees?.toLowerCase(), "0x8745d906d67c346e5eb1aeeed38eb87f34df0c0a");

  // Alias lookups
  assert.equal(getCircleChain("arc", true)?.cctpDomainId, 26);
  assert.equal(getCircleChain("arc_testnet", true)?.cctpDomainId, 26);
});

test("Step 3: Direct same-chain USDC transfer on Arc Testnet", async () => {
  assert.equal(isDirectUsdcTransferSupported("arc-testnet", "arc-testnet", "USDC", true), true);

  const result = await discoverPaymentRoutes({
    invoiceId: "inv-arc-direct-1",
    amountMinor: 2500, // $25.00
    currency: "USD",
    destinationNetwork: "arc-testnet",
    recipientAddress: MERCHANT_ADDRESS,
    sourceAssetId: "arc-testnet:usdc",
    sourceNetwork: "arc-testnet",
    sourceSymbol: "USDC",
    sourceDecimals: 6,
    sourceContractAddress: ARC_USDC_CONTRACT,
    senderAddress: SENDER_ADDRESS,
    isTestnet: true,
  });

  assert.equal(result.error, undefined);
  assert.ok(result.routes.length >= 1);

  const directRoute = result.routes[0];
  assert.equal(directRoute.provider, "circle_direct");
  assert.equal(directRoute.sourceNetwork, "arc-testnet");
  assert.equal(directRoute.destinationNetwork, "arc-testnet");
  assert.equal(directRoute.requestedAmount, "25000000"); // 25 USDC (6 decimals)
  assert.equal(directRoute.expectedReceivedAmount, "25000000");
  assert.equal(directRoute.depositAddress, MERCHANT_ADDRESS);
  assert.equal(directRoute.fees.protocolFeeUsd, "0.00");
  assert.equal(directRoute.coversInvoice, true);
});

test("Step 3: Cross-chain CCTP V2 from Arc Testnet to existing 4 networks", async () => {
  const targetChains = ["sepolia", "base-sepolia", "arbitrum-sepolia", "optimism-sepolia"];

  for (const target of targetChains) {
    assert.equal(isCctpRouteSupported("arc-testnet", target, true), true, `Arc to ${target} CCTP route`);

    const result = await discoverPaymentRoutes({
      invoiceId: `inv-arc-to-${target}`,
      amountMinor: 5000, // $50.00
      currency: "USD",
      destinationNetwork: target,
      recipientAddress: MERCHANT_ADDRESS,
      sourceAssetId: "arc-testnet:usdc",
      sourceNetwork: "arc-testnet",
      sourceSymbol: "USDC",
      sourceDecimals: 6,
      sourceContractAddress: ARC_USDC_CONTRACT,
      senderAddress: SENDER_ADDRESS,
      isTestnet: true,
    });

    assert.equal(result.error, undefined);
    const cctpRoute = result.routes.find((r) => r.provider === "circle_cctp");
    assert.ok(cctpRoute, `CCTP route must exist for arc-testnet -> ${target}`);
    assert.equal(cctpRoute?.sourceNetwork, "arc-testnet");
    assert.equal(cctpRoute?.destinationNetwork, target);
    assert.equal(cctpRoute?.requestedAmount, "50000000");
    assert.equal(cctpRoute?.expectedReceivedAmount, "50000000");
    assert.equal(cctpRoute?.depositAddress.toLowerCase(), ARC_TOKEN_MESSENGER.toLowerCase());
    assert.equal(cctpRoute?.quoteSnapshot.sourceCctpDomain, 26);
  }
});

test("Step 3: Cross-chain CCTP V2 from existing 4 networks to Arc Testnet", async () => {
  const sourceChains = ["sepolia", "base-sepolia", "arbitrum-sepolia", "optimism-sepolia"];

  for (const source of sourceChains) {
    assert.equal(isCctpRouteSupported(source, "arc-testnet", true), true, `${source} to Arc CCTP route`);

    const sourceChainInfo = getCircleChain(source, true);
    const result = await discoverPaymentRoutes({
      invoiceId: `inv-${source}-to-arc`,
      amountMinor: 10000, // $100.00
      currency: "USD",
      destinationNetwork: "arc-testnet",
      recipientAddress: MERCHANT_ADDRESS,
      sourceAssetId: `${source}:usdc`,
      sourceNetwork: source,
      sourceSymbol: "USDC",
      sourceDecimals: 6,
      sourceContractAddress: sourceChainInfo.usdcAddress,
      senderAddress: SENDER_ADDRESS,
      isTestnet: true,
    });

    assert.equal(result.error, undefined);
    const cctpRoute = result.routes.find((r) => r.provider === "circle_cctp");
    assert.ok(cctpRoute, `CCTP route must exist for ${source} -> arc-testnet`);
    assert.equal(cctpRoute?.sourceNetwork, source);
    assert.equal(cctpRoute?.destinationNetwork, "arc-testnet");
    assert.equal(cctpRoute?.quoteSnapshot.destinationCctpDomain, 26);
    assert.equal(cctpRoute?.recipientAddress, MERCHANT_ADDRESS);
  }
});

test("Complete 5x5 Matrix: 5 direct transfers + 20 cross-chain CCTP routes = 25 supported routes", async () => {
  const networks = circleTestnetUsdcNetworks.map((n) => n.key);
  assert.equal(networks.length, 5);

  let directCount = 0;
  let cctpCount = 0;

  for (const source of networks) {
    for (const destination of networks) {
      const sourceCircle = getCircleChain(source, true);
      const result = await discoverPaymentRoutes({
        invoiceId: `inv-matrix-${source}-${destination}`,
        amountMinor: 1000,
        currency: "USD",
        destinationNetwork: destination,
        recipientAddress: MERCHANT_ADDRESS,
        sourceAssetId: `${source}:usdc`,
        sourceNetwork: source,
        sourceSymbol: "USDC",
        sourceDecimals: 6,
        sourceContractAddress: sourceCircle.usdcAddress,
        isTestnet: true,
      });

      assert.equal(result.error, undefined);
      assert.ok(result.routes.length >= 1);

      if (source === destination) {
        assert.equal(result.routes[0].provider, "circle_direct");
        directCount += 1;
      } else {
        assert.equal(result.routes[0].provider, "circle_cctp");
        cctpCount += 1;
      }
    }
  }

  assert.equal(directCount, 5, "5 direct same-chain USDC routes");
  assert.equal(cctpCount, 20, "20 cross-chain CCTP V2 USDC routes");
  assert.equal(directCount + cctpCount, 25, "Complete 5x5 = 25 route matrix");
});

test("Settlement verification: Arc Testnet resolves fallback RPC and confirmations safely without .env.local", () => {
  const readiness = checkCctpCorridorReadiness("base-sepolia", "arc-testnet");
  assert.equal(readiness.destinationRpcConfigured, true);
  assert.equal(readiness.confirmationsConfigured, true);
  assert.equal(readiness.requiredConfirmations, 2);

  const reverseReadiness = checkCctpCorridorReadiness("arc-testnet", "base-sepolia");
  assert.equal(reverseReadiness.sourceRpcConfigured, true);
});

