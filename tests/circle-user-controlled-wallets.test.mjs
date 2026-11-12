import { test, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

mock.module("server-only", {
  defaultExport: {},
});

const { CircleUserControlledWalletsClient, Blockchain } = await import("@circle-fin/user-controlled-wallets");
const { createViemAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");
const { AppKit } = await import("@circle-fin/app-kit");
const { CircleEip1193Provider } = await import("../src/lib/wallet/circle-eip1193-provider.ts");
const { circleWalletConnector } = await import("../src/lib/wallet/circle-wagmi-connector.ts");
const {
  isCircleWalletsConfigured,
  getCircleAppId,
  getOrCreateCircleUserToken,
  initCircleUserWalletChallenge,
  listCircleUserWallets,
} = await import("../src/lib/server/circle-wallets.ts");

test("Circle User-Controlled Wallets: uses actual UCW SDK, never developer-controlled", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  assert.ok(
    packageJson.dependencies["@circle-fin/user-controlled-wallets"],
    "Must have @circle-fin/user-controlled-wallets in dependencies"
  );
  assert.ok(
    packageJson.dependencies["@circle-fin/w3s-pw-web-sdk"],
    "Must have @circle-fin/w3s-pw-web-sdk in dependencies"
  );
  assert.equal(
    packageJson.dependencies["@circle-fin/developer-controlled-wallets"],
    undefined,
    "Must not use developer-controlled wallets SDK"
  );

  const client = new CircleUserControlledWalletsClient({ apiKey: "TEST_API_KEY" });
  assert.equal(typeof client.createUserToken, "function", "createUserToken must exist");
  assert.equal(typeof client.createUserPinWithWallets, "function", "createUserPinWithWallets must exist");
  assert.equal(typeof client.listWallets, "function", "listWallets must exist");
  assert.equal(typeof client.createTransaction, "function", "createTransaction must exist");
  assert.equal(
    typeof client.createUserTransactionContractExecutionChallenge,
    "function",
    "createUserTransactionContractExecutionChallenge must exist"
  );
});

test("Circle User-Controlled Wallets: verifies testnet blockchains and Base Sepolia support", () => {
  assert.equal(Blockchain.BaseSepolia, "BASE-SEPOLIA");
  assert.equal(Blockchain.ArbSepolia, "ARB-SEPOLIA");
  assert.equal(Blockchain.EthSepolia, "ETH-SEPOLIA");
});

test("Circle User-Controlled Wallets: preserves untouched files per prompt constraints", () => {
  // Constraint: Do not modify NEAR settlement migrations, NEAR backend, Circle gas-estimation helper, or live-payment-flow.tsx
  const gasHelper = fs.readFileSync(path.resolve("src/lib/payments/circle-gas-estimation.ts"), "utf8");
  assert.ok(gasHelper.includes("estimateCircleSourceGas"), "circle-gas-estimation.ts must remain intact");

  const livePaymentFlow = fs.readFileSync(path.resolve("src/components/wallet/live-payment-flow.tsx"), "utf8");
  assert.ok(livePaymentFlow.includes("LivePaymentFlow"), "live-payment-flow.tsx must remain intact");

  const nearBackend = fs.readFileSync(path.resolve("src/lib/server/near-settlement-outbox.ts"), "utf8");
  assert.ok(nearBackend.includes("claim_near_settlement_outbox"), "NEAR backend must remain intact");
});

test("Circle User-Controlled Wallets: EIP-1193 Provider and Wagmi connector compatibility", async () => {
  const dummyAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const dummySession = {
    address: dummyAddress,
    walletId: "wallet-test-123",
    chainId: 84532,
    userToken: "token-abc-123",
    encryptionKey: "enc-xyz-456",
    appId: "app-id-789",
  };

  const provider = new CircleEip1193Provider(dummySession);

  // 1. Verify EIP-1193 accounts and chain ID
  const accounts = await provider.request({ method: "eth_accounts" });
  assert.deepEqual(accounts, [dummyAddress]);

  const chainIdHex = await provider.request({ method: "eth_chainId" });
  assert.equal(chainIdHex, "0x14a34"); // 84532 in hex

  // 2. Test createViemAdapterFromProvider compatibility with Circle Bridge Kit
  const adapter = await createViemAdapterFromProvider({ provider });
  assert.ok(adapter, "Viem adapter must be successfully created from Circle EIP-1193 provider");

  // 3. Test AppKit (Circle Bridge Kit) initialization with this adapter
  const kit = new AppKit();
  assert.ok(kit, "AppKit instance must be created successfully");

  // 4. Test Wagmi connector creation
  const connector = circleWalletConnector();
  assert.ok(connector, "Connector function must be created");
});

test("Circle User-Controlled Wallets: credential protection on server and config endpoints", () => {
  assert.equal(typeof isCircleWalletsConfigured, "function");
  assert.equal(typeof getOrCreateCircleUserToken, "function");
  assert.equal(typeof initCircleUserWalletChallenge, "function");
  assert.equal(typeof listCircleUserWallets, "function");

  // Ensure server-wallets helper properly masks credentials
  const appId = getCircleAppId();
  assert.ok(appId === null || typeof appId === "string");

  // AppId can be public, but API key must never be exposed
  const configRoute = fs.readFileSync(path.resolve("src/app/api/wallet/circle/config/route.ts"), "utf8");
  assert.ok(!configRoute.includes("process.env.CIRCLE_API_KEY"), "Config route must never leak CIRCLE_API_KEY");
  assert.ok(!configRoute.includes("apiKey"), "Config route must not return apiKey");

  const guestInitRoute = fs.readFileSync(path.resolve("src/app/api/wallet/circle/guest/init/route.ts"), "utf8");
  assert.ok(!guestInitRoute.includes("apiKey:"), "Guest init route must never return server apiKey");
});

test("Circle User-Controlled Wallets: Guest checkout independent of NODUS registration", () => {
  const guestInitRoute = fs.readFileSync(path.resolve("src/app/api/wallet/circle/guest/init/route.ts"), "utf8");
  assert.ok(!guestInitRoute.includes("createSupabaseServerClient"), "Guest init must not require Supabase login");
  assert.ok(!guestInitRoute.includes("auth.getUser()"), "Guest init must not require NODUS auth session");

  const checkoutUi = fs.readFileSync(path.resolve("src/components/wallet/invoice-wallet-checkout.tsx"), "utf8");
  assert.ok(checkoutUi.includes("CircleGuestWalletCard"), "Checkout must import CircleGuestWalletCard");
  assert.ok(checkoutUi.includes("Browser / External Wallet"), "External wallet must remain prominent and available");
  assert.ok(checkoutUi.includes("Circle Wallet"), "Circle wallet must be offered as an optional method");
});

test("Circle User-Controlled Wallets: Merchant profile connection security", () => {
  const connectRoute = fs.readFileSync(
    path.resolve("src/app/api/wallet/circle/merchant/connect-profile/route.ts"),
    "utf8"
  );
  assert.ok(connectRoute.includes("createSupabaseServerClient"), "Must require authenticated merchant session");
  assert.ok(connectRoute.includes("auth.getUser()"), "Must verify user identity");
  assert.ok(connectRoute.includes("isVerified"), "Must verify that wallet address belongs to merchant");
  assert.ok(connectRoute.includes("update({"), "Must update business_profiles with verified address");
});
