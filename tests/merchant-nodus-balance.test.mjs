import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { formatAnimatedUsdcBaseUnits, formatUsdcBaseUnits, sumUsdcBaseUnits } from "../src/lib/payments/nodus-received-balance.ts";

test("USDC totals format six decimal base units without floating-point conversion", () => {
  assert.equal(formatUsdcBaseUnits("100000000"), "100");
  assert.equal(formatUsdcBaseUnits("123456789"), "123.456789");
  assert.equal(formatUsdcBaseUnits("9007199254740993123456"), "9,007,199,254,740,993.123456");
  assert.equal(formatUsdcBaseUnits("not-a-number"), "Unavailable");
});

test("balance counting displays whole numbers until it reaches the exact financial amount", () => {
  const target = 123456789n;
  assert.deepEqual(
    [0n, 1999999n, 2999999n, 120123456n].map((amount) => formatAnimatedUsdcBaseUnits(amount, target)),
    ["0", "1", "2", "120"],
  );
  assert.equal(formatAnimatedUsdcBaseUnits(target, target), "123.456789");
  assert.equal(formatAnimatedUsdcBaseUnits(999999n, 1000000n), "0");
  assert.equal(formatAnimatedUsdcBaseUnits(1000000n, 1000000n), "1");
  assert.equal(formatAnimatedUsdcBaseUnits(0n, 1n), "0");
  assert.equal(formatAnimatedUsdcBaseUnits(1n, 1n), "0.000001");
  const large = 9007199254740993123456n;
  assert.equal(formatAnimatedUsdcBaseUnits(large - 1n, large), "9,007,199,254,740,993");
  assert.equal(formatAnimatedUsdcBaseUnits(large, large), "9,007,199,254,740,993.123456");
});

test("chain aggregation sums exact base units", () => {
  assert.equal(sumUsdcBaseUnits(["100000000", "50000000", "1"]), "150000001");
  assert.throws(() => sumUsdcBaseUnits(["100", "-1"]), /invalid_usdc_base_units/);
});

test("database aggregation is authenticated, RLS-scoped, and restricted to verified paid USDC invoice payments", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261114100000_merchant_nodus_received_balance.sql", import.meta.url), "utf8");
  assert.match(sql, /security invoker/i);
  assert.match(sql, /bp\.owner_user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(sql, /i\.status\s*=\s*'paid'/i);
  assert.match(sql, /pa\.status\s*=\s*'SUCCESS'/i);
  assert.match(sql, /ps\.provider_status\s*=\s*'SUCCESS'/i);
  assert.match(sql, /ps\.outcome\s*=\s*'VERIFIED'/i);
  assert.match(sql, /ps\.received_asset_decimals\s*=\s*6/i);
  assert.match(sql, /select distinct on \(ps\.id\)/i);
  assert.match(sql, /destination_network in \([\s\S]*'base-sepolia'[\s\S]*'arbitrum-sepolia'/i);
});

test("merchant balance endpoint uses the authenticated database aggregate, not wallet balances", async () => {
  const route = await readFile(new URL("../src/app/api/merchant/balance/route.ts", import.meta.url), "utf8");
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /supabase\.rpc\("merchant_nodus_received_by_chain"\)/);
  assert.match(route, /circleTestnetUsdcNetworks/);
  assert.doesNotMatch(route, /viem|balanceOf|createPublicClient/);
});

test("dashboard refreshes Nodus receipts while visible without implying account verification", async () => {
  const component = await readFile(new URL("../src/components/merchant-usdc-balance.tsx", import.meta.url), "utf8");
  const overview = await readFile(new URL("../src/app/dashboard/page.tsx", import.meta.url), "utf8");
  const copyButton = await readFile(new URL("../src/components/copy-wallet-address-button.tsx", import.meta.url), "utf8");
  // The Overview redesign follows the configured receiving network. The old
  // network-picker markup and exact heading text are no longer its contract.
  assert.match(component, /aria-busy=\{isRefreshing\}/);
  assert.match(component, /setInterval\(refreshWhenVisible,\s*15_000\)/);
  assert.match(component, /nodus:payment-verified/);
  assert.doesNotMatch(component, /<span[^>]*>Verified<\/span>/, "the card does not claim the wallet/account is verified");
  assert.doesNotMatch(overview, /Quote Ready/);
  assert.match(overview, /shortenAddress\(business\.receiving_address\)/);
  assert.match(overview, /CopyWalletAddressButton address=\{business\.receiving_address\}/);
  assert.match(copyButton, /navigator\.clipboard\.writeText\(address\)/, "copy uses the complete address prop");
});
