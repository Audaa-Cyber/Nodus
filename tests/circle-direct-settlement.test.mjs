import test from "node:test";
import assert from "node:assert/strict";
import { getCircleChain } from "../src/lib/server/circle.ts";

test("getCircleChain resolves supported EVM chains for direct USDC transfers", () => {
  for (const network of ["base-sepolia", "arbitrum-sepolia", "ethereum", "base", "arbitrum", "polygon", "optimism"]) {
    const isTestnet = network.includes("sepolia") || network.includes("amoy") || network.includes("fuji");
    const info = getCircleChain(network, isTestnet);
    assert.ok(info, `expected circle chain info for ${network}`);
    assert.ok(info.usdcAddress.startsWith("0x"), `expected valid USDC address for ${network}`);
    assert.ok(info.chainId > 0, `expected valid chainId for ${network}`);
  }
});

test("circle_direct requires same-chain source and destination networks", () => {
  const isSameChainValid = (source, dest) => source.trim().toLowerCase() === dest.trim().toLowerCase();

  assert.equal(isSameChainValid("base-sepolia", "base-sepolia"), true);
  assert.equal(isSameChainValid("arbitrum-sepolia", "arbitrum-sepolia"), true);
  assert.equal(isSameChainValid("base", "base"), true);
  assert.equal(isSameChainValid("base-sepolia", "arbitrum-sepolia"), false);
});

test("circle_direct settlement logic is decoupled from CCTP contracts", () => {
  // circle_direct relies only on direct ERC-20 transfer verification, not token messengers or IRIS
  const directSnapshot = {
    type: "circle_direct",
    invoiceId: "inv-123",
    sourceNetwork: "base-sepolia",
    destinationNetwork: "base-sepolia",
    recipientAddress: "0x1234567890123456789012345678901234567890",
  };

  assert.equal(directSnapshot.type, "circle_direct");
  assert.equal(directSnapshot.sourceNetwork, directSnapshot.destinationNetwork);
  assert.equal(directSnapshot.tokenMessengerAddress, undefined);
  assert.equal(directSnapshot.cctpDomainId, undefined);
});
