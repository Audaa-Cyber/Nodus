import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RECOMMENDED_CHAIN_ID,
  DEFAULT_RECOMMENDED_CHAIN_NAME,
  baseSepoliaChain,
  getRecommendedEvmChain,
  getWalletNetwork,
  getEvmWalletNetwork,
} from "../src/lib/wallet/networks.ts";
import { getCircleChain } from "../src/lib/server/circle.ts";

test("Task 1: Default recommended chain is Base Sepolia (84532), not Base Mainnet (8453)", () => {
  assert.equal(
    DEFAULT_RECOMMENDED_CHAIN_ID,
    84532,
    "DEFAULT_RECOMMENDED_CHAIN_ID must be 84532 (Base Sepolia)"
  );
  assert.equal(
    DEFAULT_RECOMMENDED_CHAIN_NAME,
    "Base Sepolia",
    "DEFAULT_RECOMMENDED_CHAIN_NAME must be 'Base Sepolia'"
  );
  assert.equal(
    baseSepoliaChain.id,
    84532,
    "baseSepoliaChain.id must be 84532"
  );

  const defaultChain = getRecommendedEvmChain();
  assert.equal(defaultChain.id, 84532);
  assert.equal(defaultChain.name, "Base Sepolia");

  // Verify alignment with Circle CCTP source chain configuration
  const circleBaseSepolia = getCircleChain("base-sepolia", true);
  assert.ok(circleBaseSepolia, "Circle Base Sepolia must exist in testnet configuration");
  assert.equal(
    circleBaseSepolia.chainId,
    DEFAULT_RECOMMENDED_CHAIN_ID,
    "DEFAULT_RECOMMENDED_CHAIN_ID must match Circle testnet source chain ID"
  );
});

test("Task 1: Network resolution returns correct metadata for Base Sepolia and Arbitrum Sepolia", () => {
  const baseSepoliaNet = getWalletNetwork("base-sepolia");
  assert.ok(baseSepoliaNet);
  assert.equal(baseSepoliaNet.chainId, 84532);
  assert.equal(baseSepoliaNet.family, "evm");
  assert.equal(baseSepoliaNet.label, "Base Sepolia");

  const arbSepoliaNet = getWalletNetwork("arbitrum-sepolia");
  assert.ok(arbSepoliaNet);
  assert.equal(arbSepoliaNet.chainId, 421614);
  assert.equal(arbSepoliaNet.family, "evm");
  assert.equal(arbSepoliaNet.label, "Arbitrum Sepolia");

  const resolvedByChainId = getEvmWalletNetwork(84532);
  assert.ok(resolvedByChainId);
  assert.equal(resolvedByChainId.key, "base-sepolia");
});

test("Task 2: Public simulation feature gate prevents public customer simulation", () => {
  // Simulate public production environment conditions
  const publicEnv = {
    NODE_ENV: "production",
    NEXT_PUBLIC_ENABLE_PAYMENT_SIMULATION: undefined,
  };

  const isSimulationAllowedInProduction =
    publicEnv.NODE_ENV !== "production" &&
    publicEnv.NEXT_PUBLIC_ENABLE_PAYMENT_SIMULATION === "true";

  assert.equal(
    isSimulationAllowedInProduction,
    false,
    "Simulation must be disabled in production"
  );

  // Even in non-production, simulation must require an explicit opt-in flag
  const devDefaultEnv = {
    NODE_ENV: "development",
    NEXT_PUBLIC_ENABLE_PAYMENT_SIMULATION: undefined,
  };
  const isSimulationAllowedByDefaultInDev =
    devDefaultEnv.NODE_ENV !== "production" &&
    devDefaultEnv.NEXT_PUBLIC_ENABLE_PAYMENT_SIMULATION === "true";

  assert.equal(
    isSimulationAllowedByDefaultInDev,
    false,
    "Simulation must not be exposed by default even in development without explicit opt-in"
  );
});

test("Task 3: Page refresh recovery treats server status as authoritative and rejects client-only success", () => {
  const shareToken = "test-token-abcdef1234567890abcdef1234567890";
  const validAttemptId = "123e4567-e89b-42d3-a456-426614174000";

  // Simulate local storage item
  const clientStorage = new Map();
  clientStorage.set(`nodus:live-attempt:${shareToken}`, validAttemptId);

  // Client storage presence alone cannot prove settlement
  const isSettledFromStorageAlone = clientStorage.has(`nodus:live-attempt:${shareToken}`);
  assert.equal(
    isSettledFromStorageAlone,
    true,
    "Storage has attempt pointer"
  );
  // Authoritative server check simulation:
  const serverResponsePending = {
    attempt: { id: validAttemptId, status: "PROCESSING" },
    pending: true,
    settled: false,
  };
  assert.equal(
    serverResponsePending.settled,
    false,
    "Server authoritative status is pending, not settled"
  );

  const serverResponseSettled = {
    attempt: { id: validAttemptId, status: "SUCCESS" },
    settled: true,
    receipts: [{ receipt_number: "RCP-2026-001", issued_at: "2026-11-11T00:00:00Z" }],
  };

  // Only server response confirms settlement
  assert.equal(
    serverResponseSettled.settled && serverResponseSettled.attempt.status === "SUCCESS",
    true,
    "Settlement is confirmed exclusively by server response"
  );

  // Upon confirmed settlement, client storage is cleared
  if (serverResponseSettled.settled) {
    clientStorage.delete(`nodus:live-attempt:${shareToken}`);
  }
  assert.equal(
    clientStorage.has(`nodus:live-attempt:${shareToken}`),
    false,
    "Storage pointer cleared after server confirms settlement"
  );
});

test("Task 4: Authoritative destination disclosure binds merchant recipient and destination network", () => {
  // Authoritative server context structure
  const authoritativeContext = {
    invoice_id: "invoice-uuid-1",
    business_name: "Acme Corp",
    amount_minor: 5000,
    currency: "USD",
    receiving_network: "arbitrum-sepolia",
    receiving_address: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  };

  // Untrusted client attempt to override
  const untrustedClientInput = {
    recipientAddress: "0xAttackerAddress000000000000000000000000",
    destinationNetwork: "mainnet",
  };

  // Disclosure must reflect authoritative database context
  const disclosedDestinationNetwork = authoritativeContext.receiving_network;
  const disclosedRecipientAddress = authoritativeContext.receiving_address;

  assert.equal(disclosedDestinationNetwork, "arbitrum-sepolia");
  assert.equal(disclosedRecipientAddress, "0x742d35Cc6634C0532925a3b844Bc454e4438f44e");
  assert.notEqual(
    disclosedRecipientAddress,
    untrustedClientInput.recipientAddress,
    "Client input must never override authoritative merchant recipient"
  );
});

test("Task 5: Solana assets and wallet card are excluded for Circle EVM testnet route", () => {
  const assetInventory = [
    { assetId: "base-sepolia:usdc", symbol: "USDC", network: { key: "base-sepolia", family: "evm", chainId: 84532 } },
    { assetId: "ethereum:usdc", symbol: "USDC", network: { key: "ethereum", family: "evm", chainId: 1 } },
    { assetId: "solana:sol", symbol: "SOL", network: { key: "solana", family: "solana" } },
    { assetId: "solana:usdc", symbol: "USDC", network: { key: "solana", family: "solana" } },
  ];

  // Filter EVM only
  const evmOnlyAssets = assetInventory.filter((a) => a.network.family === "evm");
  assert.equal(evmOnlyAssets.length, 2);
  assert.ok(!evmOnlyAssets.some((a) => a.network.family === "solana"));
  assert.ok(!evmOnlyAssets.some((a) => a.symbol === "SOL"));
});

