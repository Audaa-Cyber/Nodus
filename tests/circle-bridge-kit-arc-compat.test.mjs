import assert from "node:assert/strict";
import { test } from "node:test";
import { Blockchain, BridgeKit } from "@circle-fin/bridge-kit";

test("installed Circle Bridge Kit enables upfront fees for Arc Testnet without dropping existing source networks", () => {
  const sourceFeeChains = new Set(new BridgeKit().getSupportedChains({ sourceFeeSupported: true }).map((chain) => chain.chain));

  for (const chain of [
    Blockchain.Arc_Testnet,
    Blockchain.Ethereum_Sepolia,
    Blockchain.Base_Sepolia,
    Blockchain.Arbitrum_Sepolia,
    Blockchain.Optimism_Sepolia,
  ]) {
    assert.ok(sourceFeeChains.has(chain), `${chain} should remain eligible for Circle upfront-fee routes`);
  }
});
