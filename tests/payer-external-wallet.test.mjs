import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.resolve(file), "utf8");

test("payer checkout only offers injected EVM wallets with multi-wallet discovery", () => {
  const checkout = read("src/components/wallet/invoice-wallet-checkout.tsx");
  const providers = read("src/components/wallet/wallet-providers.tsx");
  const walletCard = read("src/components/wallet/evm-wallet-card.tsx");

  assert.ok(!checkout.includes("CircleGuestWalletCard"));
  assert.ok(!checkout.includes("walletMethod"));
  assert.match(providers, /connectors:\s*\[injected\(\)\]/);
  assert.match(providers, /multiInjectedProviderDiscovery:\s*true/);
  assert.ok(!providers.includes("circleWalletConnector"));
  assert.match(walletCard, /connectors\.map/);
  assert.match(walletCard, /MetaMask, Rabby, or another injected EVM wallet/);
  assert.match(walletCard, /connection was declined/i);
});

test("payer Circle embedded-wallet path is removed", () => {
  for (const file of [
    "src/components/wallet/circle-guest-wallet-card.tsx",
    "src/lib/wallet/circle-eip1193-provider.ts",
    "src/lib/wallet/circle-wagmi-connector.ts",
    "src/app/api/wallet/circle/config/route.ts",
    "src/app/api/wallet/circle/guest/init/route.ts",
    "src/app/api/wallet/circle/guest/wallets/route.ts",
    "src/app/api/wallet/circle/guest/transaction/route.ts",
  ]) {
    assert.equal(fs.existsSync(path.resolve(file)), false, `${file} should not exist`);
  }

  const circleWallets = read("src/lib/server/circle-wallets.ts");
  assert.ok(!circleWallets.includes("createCircleTransferChallenge"));
  assert.ok(!circleWallets.includes("createCircleContractExecutionChallenge"));
  assert.match(circleWallets, /initCircleUserWalletChallenge/);
  assert.match(circleWallets, /listCircleUserWallets/);
});

test("Circle Bridge Kit and verified settlement flow remain connected to injected providers", () => {
  const liveFlow = read("src/components/wallet/live-payment-flow.tsx");
  const bridgeRecovery = read("src/lib/payments/circle-bridge-recovery.ts");
  const packageJson = JSON.parse(read("package.json"));

  assert.match(liveFlow, /executeCircleBridgeAfterFreshReservation/);
  assert.match(liveFlow, /createViemAdapterFromProvider/);
  assert.match(liveFlow, /new AppKit\(\)/);
  assert.match(liveFlow, /data\.settled \|\| data\.attempt\?\.status === "SUCCESS"/);
  assert.match(liveFlow, /Payment complete & verified/);
  assert.match(bridgeRecovery, /BridgeResult/);
  assert.ok(packageJson.dependencies["@circle-fin/app-kit"]);
  assert.ok(packageJson.dependencies["@circle-fin/adapter-viem-v2"]);
});

test("merchant Circle wallet onboarding and receiving-address checks remain intact", () => {
  const packageJson = JSON.parse(read("package.json"));
  const merchantCard = read("src/components/merchant-circle-wallet-card.tsx");
  const merchantRoute = read("src/app/api/wallet/circle/merchant/route.ts");
  const initRoute = read("src/app/api/wallet/circle/merchant/init/route.ts");
  const connectRoute = read("src/app/api/wallet/circle/merchant/connect-profile/route.ts");

  assert.ok(packageJson.dependencies["@circle-fin/user-controlled-wallets"]);
  assert.ok(packageJson.dependencies["@circle-fin/w3s-pw-web-sdk"]);
  assert.match(merchantCard, /Create Circle User-Controlled Wallet/);
  assert.match(merchantCard, /connect-profile/);
  assert.match(merchantRoute, /listCircleUserWallets/);
  assert.match(initRoute, /initCircleUserWalletChallenge/);
  assert.match(connectRoute, /auth\.getUser\(\)/);
  assert.match(connectRoute, /isVerified/);
  assert.match(connectRoute, /update\(/);
});
