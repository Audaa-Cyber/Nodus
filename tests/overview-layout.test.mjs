import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Dashboard Overview adheres to layout, component, and animation contracts", async () => {
  const page = await readFile(new URL("../src/app/dashboard/page.tsx", import.meta.url), "utf8");
  const balanceCard = await readFile(new URL("../src/components/merchant-usdc-balance.tsx", import.meta.url), "utf8");
  const donutComponent = await readFile(new URL("../src/components/merchant-donut-chart.tsx", import.meta.url), "utf8");
  const distribution = await readFile(new URL("../src/lib/dashboard/network-distribution.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

  // 1. Metric card percentage pill: rendered with MetricPercentageBadge, duplicate removed
  assert.match(page, /<MetricPercentageBadge/);
  assert.doesNotMatch(page, /overview-metric-subtext/, "duplicate percentage label in metric bottom is removed");

  // 2. Decorative wave and coin removed from balance card
  assert.doesNotMatch(balanceCard, /overview-balance-art/, "decorative wave is removed");
  assert.doesNotMatch(balanceCard, /overview-balance-coin/, "decorative coin is removed");

  // 3. Multi-chain Donut chart rendered in balance card
  assert.match(balanceCard, /<MerchantDonutChart/);

  // 4. Network chart accents keep Ethereum and Arc visually distinct
  assert.match(distribution, /\["base-sepolia", "#0000FF"\]/);
  assert.match(distribution, /\["arbitrum-sepolia", "#12AAFF"\]/);
  assert.match(distribution, /\["optimism-sepolia", "#FF0421"\]/);
  assert.match(distribution, /\["sepolia", "#8C8C8C"\]/);
  assert.match(distribution, /\["arc-testnet", "#3E2B63"\]/);

  // 5. Empty state and center display
  assert.match(donutComponent, /overview-donut-empty-ring/);
  assert.match(donutComponent, /0 USDC/);
  assert.match(donutComponent, /Total Received/);

  // 6. Legend elements
  assert.match(donutComponent, /overview-donut-legend/);
  assert.match(donutComponent, /overview-legend-color-dot/);
  assert.match(donutComponent, /<NetworkLogo/);

  // 7. Refresh button relocated to heading; footer only contains feedback
  assert.match(balanceCard, /overview-balance-heading[\s\S]*overview-balance-refresh-btn/);
  assert.match(balanceCard, /overview-balance-footer[\s\S]*overview-refresh-feedback/);
  assert.doesNotMatch(balanceCard, /overview-balance-footer[\s\S]*<button/, "button removed from footer");

  // 8. CSS animation keyframes and classes exist
  assert.match(css, /overview-donut-wrapper/);
  assert.match(css, /overview-donut-stage/);
  assert.match(css, /overview-donut-segment/);
  assert.match(css, /overview-donut-center/);
  assert.match(css, /overview-metric-share/);
});
