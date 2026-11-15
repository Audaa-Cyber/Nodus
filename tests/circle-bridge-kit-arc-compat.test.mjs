import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Blockchain, BridgeKit } from "@circle-fin/bridge-kit";
import { AppKit } from "@circle-fin/app-kit";

test("installed Circle Bridge Kit and App Kit enable Arc upfront fees without dropping existing source networks", () => {
  const sdkSurfaces = [
    ["Bridge Kit", new BridgeKit().getSupportedChains({ sourceFeeSupported: true })],
    ["App Kit", new AppKit().getSupportedChains("bridge", { sourceFeeSupported: true })],
  ];

  for (const [sdkName, chains] of sdkSurfaces) {
    const sourceFeeChains = new Set(chains.map((chain) => chain.chain));
    for (const chain of [
      Blockchain.Arc_Testnet,
      Blockchain.Ethereum_Sepolia,
      Blockchain.Base_Sepolia,
      Blockchain.Arbitrum_Sepolia,
      Blockchain.Optimism_Sepolia,
    ]) {
      assert.ok(sourceFeeChains.has(chain), `${sdkName}: ${chain} should remain eligible for Circle upfront-fee routes`);
    }
  }
});

test("every App Kit ESM and CJS bridge entrypoint has Arc in its source-fee execution allowlist", async () => {
  for (const entrypoint of ["bridge", "estimateBridge"]) {
    for (const extension of ["mjs", "cjs"]) {
      const path = new URL(`../node_modules/@circle-fin/app-kit/${entrypoint}.${extension}`, import.meta.url);
      const contents = await readFile(path, "utf8");
      const allowlistStart = contents.indexOf("const SOURCE_FEE_SUPPORTED_ALLOWLIST = new Set([");
      const allowlistEnd = contents.indexOf("\n]);", allowlistStart);
      assert.ok(allowlistStart >= 0 && allowlistEnd > allowlistStart, `${entrypoint}.${extension} allowlist exists`);
      assert.match(contents.slice(allowlistStart, allowlistEnd), /Blockchain\.Arc_Testnet,/);
    }
  }
});
