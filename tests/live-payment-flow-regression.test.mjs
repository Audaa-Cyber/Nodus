import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const flow = await readFile(new URL("../src/components/wallet/live-payment-flow.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("expired quotes are cleared, route discovery refreshes once per stale route, and the payer can request a new quote", () => {
  assert.match(flow, /if \(!Number\.isFinite\(expiresAt\) \|\| expiresAt <= Date\.now\(\)\) \{[\s\S]*?setCircleQuote\(null\);[\s\S]*?lastExpiredRouteRefresh\.current === expiredRouteKey[\s\S]*?await fetchRoutes\(\);/);
  assert.match(flow, /Route information refreshed\. Request a fresh Circle quote to continue\./);
  assert.match(flow, /circleQuote\s*\? `Authorize payment \(\$\{circleQuote\.totalDebit\} USDC\)`\s*: "Get Circle quote"/);
  assert.match(flow, /const quoteExpiresAt = circleQuote\?\.expiresAt \?\? selectedRoute\?\.quoteExpiresAt/);
});

test("wallet rejection and uncertain Circle execution remain distinct without client-side reservation release or retry", () => {
  assert.match(flow, /code === "4001" \|\| code === "action_rejected" \|\| name === "userrejectedrequesterror"/);
  assert.match(flow, /Your wallet rejected a request\. The server execution reservation remains active/);
  assert.match(flow, /Circle execution status is uncertain after reservation\. A source burn may have broadcast/);
  assert.match(flow, /if \(circleExecutionStarted\) \{\s*setStage\("verifying"\);\s*setRecoveryRequired\(true\);/);
  assert.doesNotMatch(flow, /clearCircleExecutionReservation|releaseCircleExecutionReservation/);
});

test("Circle authorization explains approval, burn authorization, and the limits of cancellation", () => {
  assert.match(flow, /Step 1: USDC approval/);
  assert.match(flow, /Step 2: CCTP burn authorization/);
  assert.match(flow, /A broadcast CCTP burn cannot simply be cancelled/);
  assert.match(styles, /\.wallet-execution-steps/);
});

test("Circle fee disclosure avoids a duplicated total and separates expected from minimum receipt", () => {
  assert.match(flow, /circleQuote\.feeItems\.length > 0 \? circleQuote\.feeItems\.map/);
  assert.match(flow, /Circle fees total/);
  assert.match(flow, /<dt>Expected received<\/dt>[\s\S]*?<dt>Minimum received<\/dt>/);
  assert.doesNotMatch(flow, /Expected \/ minimum received/);
  assert.match(flow, /!circleQuote && <div><dt>Network fees<\/dt>/);
});

test("manual recovery requests only a source burn hash and links to Base Sepolia when the payer is known", () => {
  const recovery = flow.slice(flow.indexOf("async function attachRecoveredSourceTransaction"), flow.indexOf("const busy ="));
  assert.match(flow, /Source CCTP burn transaction hash/);
  assert.match(flow, /View payer address on Base Sepolia explorer/);
  assert.match(flow, /sepolia\.basescan\.org\/address/);
  assert.match(flow, /A USDC approval transaction hash cannot substitute for the CCTP burn hash/);
  assert.doesNotMatch(recovery, /approvalTransactionHash/);
  assert.doesNotMatch(flow, /Optional USDC approval transaction hash/);
  assert.match(styles, /\.wallet-recovery-panel/);
});
