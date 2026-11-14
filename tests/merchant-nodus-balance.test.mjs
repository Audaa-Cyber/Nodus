import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { formatUsdcBaseUnits, sumUsdcBaseUnits } from "../src/lib/payments/nodus-received-balance.ts";

test("USDC totals format six decimal base units without floating-point conversion", () => {
  assert.equal(formatUsdcBaseUnits("100000000"), "100");
  assert.equal(formatUsdcBaseUnits("123456789"), "123.456789");
  assert.equal(formatUsdcBaseUnits("9007199254740993123456"), "9,007,199,254,740,993.123456");
  assert.equal(formatUsdcBaseUnits("not-a-number"), "Unavailable");
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

test("dashboard refreshes verified balances while visible and labels them as NODUS receipts", async () => {
  const component = await readFile(new URL("../src/components/merchant-usdc-balance.tsx", import.meta.url), "utf8");
  assert.match(component, /TOTAL RECEIVED THROUGH NODUS/);
  assert.match(component, /This is not your wallet balance/);
  assert.match(component, /Filter NODUS received balance by chain/);
  assert.match(component, /setInterval\(refreshWhenVisible,\s*15_000\)/);
  assert.match(component, /nodus:payment-verified/);
});
