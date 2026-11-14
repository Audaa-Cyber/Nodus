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

test("recovery automatically verifies the saved source hash without asking the payer to paste it", () => {
  const recovery = flow.slice(flow.indexOf("{recoveryRequired && attemptId"), flow.indexOf("{destinationReceipts.length"));
  assert.match(flow, /typeof data\.attempt\?\.transaction_hash === "string"/);
  assert.match(flow, /setDepositTxHash\(data\.attempt\.transaction_hash\)/);
  assert.match(flow, /\/progress`/);
  assert.match(flow, /kit\.retryBridge\(bridgeRes, \{ from: adapter \}\)/);
  assert.doesNotMatch(recovery, /<input|transaction hash below|Resume verification/);
  assert.doesNotMatch(flow, /recoveryTxHash|attachRecoveredSourceTransaction/);
  assert.doesNotMatch(flow, /Optional USDC approval transaction hash/);
  assert.match(styles, /\.wallet-recovery-panel/);
});

test("Circle checkout uses the server quote and estimates source gas for the selected network", () => {
  assert.match(flow, /import\s*\{[^}]*estimateCircleSourceGas[^}]*\}\s*from\s*"@\/lib\/payments\/circle-gas-estimation"/);
  assert.match(flow, /const gasEstimate = await estimateCircleSourceGas\(\{[\s\S]*?payerAddress: activeAddress as `0x\$\{string\}`,\s*amountBaseUnits: requiredUsdcBaseUnits,\s*publicClient,/);
  assert.match(flow, /const signedQuote = quoteSnapshot\.quote/);
  assert.match(flow, /fallbackChain: sourceChain/);
  assert.match(flow, /address: selectedAsset\.contractAddress as `0x\$\{string\}`/);
  assert.match(flow, /if \(nativeBalance < estimatedGasWei\) throw new Error\(`Insufficient \$\{sourceNetwork\.label\}/);
  assert.match(flow, /if \(usdcBalance < requiredUsdcBaseUnits\) throw new Error\(`Insufficient \$\{sourceNetwork\.label\} USDC/);
  assert.doesNotMatch(flow, /estimate\.gasFees\.filter/);
  assert.doesNotMatch(flow, /kit\.estimateBridge/);
  assert.match(flow, /Estimated \{getWalletNetwork\(selectedRoute\.sourceNetwork\)/);
});

test("Circle quote expiry metadata survives checkout preparation and reaches attempt validation", () => {
  assert.match(flow, /const quoteExpiryMode = quoteSnapshot\.quoteExpiryMode/);
  assert.match(flow, /const quoteExpiresAtBlock = quoteSnapshot\.quoteExpiresAtBlock/);
  assert.match(flow, /quoteExpiryMode,\s*\.\.\.\(quoteExpiryMode === "BLOCK_NUMBER" \? \{ quoteExpiresAtBlock: quoteExpiresAtBlock as number \} : \{\}\)/);
  assert.match(flow, /quoteExpiryMode: circleQuote\.quoteExpiryMode/);
  assert.match(flow, /quoteExpiresAtBlock: circleQuote\.quoteExpiresAtBlock/);
  assert.match(flow, /process\.env\.NODE_ENV === "development" && typeof attemptData\.reason === "string"/);
});
