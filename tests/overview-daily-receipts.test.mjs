import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildThirtyDayDateRange, computeDailyReceipts } from "../src/lib/dashboard/daily-receipts.ts";

test("buildThirtyDayDateRange generates exactly 30 consecutive UTC dates ending today", () => {
  const refDate = new Date("2026-11-16T12:00:00Z");
  const dates = buildThirtyDayDateRange(refDate);

  assert.equal(dates.length, 30);
  assert.equal(dates[0], "2026-10-18");
  assert.equal(dates[29], "2026-11-16");

  // Consecutive check
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(`${dates[i - 1]}T00:00:00Z`);
    const curr = new Date(`${dates[i]}T00:00:00Z`);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    assert.equal(diffDays, 1);
  }
});

test("computeDailyReceipts aggregates only verified settlements for the selected network", () => {
  const dates = ["2026-11-14", "2026-11-15", "2026-11-16"];
  const mockSettlements = [
    // Valid Base Sepolia settlement on Nov 15: 50 USDC
    {
      destination_network: "base-sepolia",
      received_amount_base_units: "50000000",
      received_asset_decimals: 6,
      created_at: "2026-11-15T10:30:00Z",
    },
    // Valid Base Sepolia settlement on Nov 15: 25.5 USDC
    {
      destination_network: "base-sepolia",
      received_amount_base_units: "25500000",
      received_asset_decimals: 6,
      created_at: "2026-11-15T14:15:00Z",
    },
    // Different network (Arbitrum Sepolia): should be excluded when querying Base Sepolia
    {
      destination_network: "arbitrum-sepolia",
      received_amount_base_units: "100000000",
      received_asset_decimals: 6,
      created_at: "2026-11-15T12:00:00Z",
    },
    // Non-6-decimal settlement: should be safely ignored
    {
      destination_network: "base-sepolia",
      received_amount_base_units: "1000000000000000000",
      received_asset_decimals: 18,
      created_at: "2026-11-16T08:00:00Z",
    },
    // Invalid amount string: ignored
    {
      destination_network: "base-sepolia",
      received_amount_base_units: "invalid",
      received_asset_decimals: 6,
      created_at: "2026-11-16T09:00:00Z",
    },
    // Valid Base Sepolia settlement on Nov 16: 10 USDC
    {
      destination_network: "base-sepolia",
      received_amount_base_units: "10000000",
      received_asset_decimals: 6,
      created_at: "2026-11-16T11:00:00Z",
    },
  ];

  const result = computeDailyReceipts(mockSettlements, "base-sepolia", dates);

  assert.equal(result.length, 3);
  assert.deepEqual(result[0], {
    date: "2026-11-14",
    totalBaseUnits: "0",
    paymentCount: 0,
    usdcFormatted: "0",
  });
  assert.deepEqual(result[1], {
    date: "2026-11-15",
    totalBaseUnits: "75500000",
    paymentCount: 2,
    usdcFormatted: "75.5",
  });
  assert.deepEqual(result[2], {
    date: "2026-11-16",
    totalBaseUnits: "10000000",
    paymentCount: 1,
    usdcFormatted: "10",
  });
});

test("computeDailyReceipts returns zero-filled points when settlements are null or empty", () => {
  const dates = ["2026-11-15", "2026-11-16"];
  const resultNull = computeDailyReceipts(null, "base-sepolia", dates);
  assert.equal(resultNull.length, 2);
  assert.equal(resultNull[0].paymentCount, 0);
  assert.equal(resultNull[0].totalBaseUnits, "0");
  assert.equal(resultNull[0].usdcFormatted, "0");
  assert.equal(resultNull[1].paymentCount, 0);

  const resultEmpty = computeDailyReceipts([], "base-sepolia", dates);
  assert.equal(resultEmpty.length, 2);
  assert.equal(resultEmpty[0].paymentCount, 0);
});

test("Dashboard Overview adheres to layout, component, and animation contracts", async () => {
  const page = await readFile(new URL("../src/app/dashboard/page.tsx", import.meta.url), "utf8");
  const balanceCard = await readFile(new URL("../src/components/merchant-usdc-balance.tsx", import.meta.url), "utf8");
  const chartComponent = await readFile(new URL("../src/components/merchant-receipts-chart.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

  // 1. Metric card percentage pill: rendered with MetricPercentageBadge, duplicate removed
  assert.match(page, /<MetricPercentageBadge/);
  assert.doesNotMatch(page, /overview-metric-subtext/, "duplicate percentage label in metric bottom is removed");

  // 2. Decorative wave and coin removed from balance card
  assert.doesNotMatch(balanceCard, /overview-balance-art/, "decorative wave is removed");
  assert.doesNotMatch(balanceCard, /overview-balance-coin/, "decorative coin is removed");

  // 3. Real receipts chart rendered in balance card
  assert.match(balanceCard, /<MerchantReceiptsChart/);
  assert.match(chartComponent, /Daily verified receipts · Last 30 days/);
  assert.match(chartComponent, /No verified receipts in the last 30 days\./);

  // 4. Refresh button relocated to heading; footer only contains feedback
  assert.match(balanceCard, /overview-balance-heading[\s\S]*overview-balance-refresh-btn/);
  assert.match(balanceCard, /overview-balance-footer[\s\S]*overview-refresh-feedback/);
  assert.doesNotMatch(balanceCard, /overview-balance-footer[\s\S]*<button/, "button removed from footer");

  // 5. CSS animation keyframes and classes exist
  assert.match(css, /chartLineDraw/);
  assert.match(css, /chartAreaFade/);
  assert.match(css, /overview-metric-share/);
  assert.match(css, /overview-chart-wrapper/);
});
