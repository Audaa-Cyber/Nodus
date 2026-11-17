import { test, mock } from "node:test";
import assert from "node:assert/strict";
import * as viem from "viem";
import { executeDirectUsdc } from "../src/lib/payments/direct-execution.ts";
import { resolveCheckoutSource } from "../src/lib/wallet/networks.ts";
import { discoverPaymentRoutes } from "../src/lib/payments/route-orchestrator.ts";
import { getCircleChain } from "../src/lib/server/circle.ts";

const payer = `0x${"1".repeat(40)}`, recipient = `0x${"2".repeat(40)}`;
const hash = `0x${"3".repeat(64)}`, blockHash = `0x${"4".repeat(64)}`;
const token = getCircleChain("arc-testnet", true).usdcAddress;

test("A-D: canonical source selection preserves Arc and the full direct/CCTP matrix", async () => {
  for (const [source, destination, provider] of [
    ["arc-testnet", "arc-testnet", "circle_direct"], ["arc-testnet", "sepolia", "circle_cctp"],
    ["arc-testnet", "base-sepolia", "circle_cctp"], ["base-sepolia", "arc-testnet", "circle_cctp"],
    ["base-sepolia", "base-sepolia", "circle_direct"], ["sepolia", "sepolia", "circle_direct"],
    ["arbitrum-sepolia", "arbitrum-sepolia", "circle_direct"], ["optimism-sepolia", "optimism-sepolia", "circle_direct"],
    ["base-sepolia", "arbitrum-sepolia", "circle_cctp"], ["arc", "arc-testnet", "circle_direct"],
  ]) {
    const result = await discoverPaymentRoutes({ invoiceId: "invoice", amountMinor: 100, currency: "USD",
      sourceAssetId: `${source}:usdc`, sourceNetwork: source, sourceSymbol: "USDC", sourceDecimals: 6,
      sourceContractAddress: getCircleChain(source, true).usdcAddress,
      destinationNetwork: destination, recipientAddress: recipient, isTestnet: true });
    assert.equal(result.routes.length, 1);
    assert.equal(result.routes[0].provider, provider);
    assert.equal(result.routes[0].recipientAddress, recipient);
  }
  assert.equal(resolveCheckoutSource(5042002, "arc-testnet").chainId, 5042002);
  assert.equal(resolveCheckoutSource(undefined, "arc-testnet").chainId, 5042002);
  assert.equal(resolveCheckoutSource(5042002, "sepolia").chainId, 5042002);
  assert.equal(resolveCheckoutSource(84532, "arc-testnet").chainId, 84532);
});

const execution = (overrides = {}) => ({ chainId: 5042002, payer, token, recipient, amount: 1000000n,
  assertWallet: async () => {}, balance: async () => ({ usdc: 2000000n, native: 10n ** 18n, gas: 10n ** 12n, gasUsesUsdc: true }),
  send: async () => hash, ...overrides });
test("A/C: direct execution sends exact ERC20 terms once without a bridge", async () => {
  let sends = 0;
  assert.equal(await executeDirectUsdc(execution({ send: async (request) => {
    sends++; assert.equal(request.chainId, 5042002); assert.equal(request.to, token);
    assert.equal(request.account, payer); assert.equal(request.value, 0n);
    assert.deepEqual(viem.decodeFunctionData({ abi: viem.parseAbi(["function transfer(address,uint256) returns (bool)"]), data: request.data }).args, [recipient, 1000000n]);
    return hash;
  } })), hash);
  assert.equal(sends, 1);
});
test("G/I: rejection never retries; network change and insufficient balances block submission", async () => {
  let sends = 0;
  await assert.rejects(executeDirectUsdc(execution({ send: async () => { sends++; throw new Error("User rejected"); } })), /User rejected/);
  assert.equal(sends, 1);
  let checks = 0;
  await assert.rejects(executeDirectUsdc(execution({ assertWallet: async () => { if (++checks === 2) throw new Error("network changed"); }, send: async () => { sends++; return hash; } })), /network changed/);
  for (const balance of [{ usdc: 0n, native: 10n, gas: 1n }, { usdc: 2000000n, native: 0n, gas: 1n }]) {
    await assert.rejects(executeDirectUsdc(execution({ balance: async () => balance, send: async () => { sends++; return hash; } })), /Insufficient/);
  }
  assert.equal(sends, 1);
});

mock.module("server-only", { defaultExport: {} });
let receipt, transaction, chainId, currentBlock;
mock.module("viem", { namedExports: { ...viem, createPublicClient: () => ({
  getChainId: async () => chainId, getTransactionReceipt: async () => receipt,
  getTransaction: async () => transaction, getBlock: async () => ({ hash: blockHash }), getBlockNumber: async () => currentBlock,
}) } });
const { verifyEvmDestinationTransfers } = await import("../src/lib/server/settlement-chain.ts");
function reset() {
  chainId = 5042002; currentBlock = 101n;
  transaction = { chainId, from: payer, to: token, blockHash };
  receipt = { status: "success", blockNumber: 100n, blockHash, logs: [{ address: token,
    topics: viem.encodeEventTopics({ abi: viem.parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"]), eventName: "Transfer", args: { from: payer, to: recipient } }),
    data: viem.encodeAbiParameters([{ type: "uint256" }], [1000000n]),
  }] };
}
const verify = () => verifyEvmDestinationTransfers({ network: "arc-testnet", payer, contractAddress: token, recipient, amount: "1000000", transactionHashes: [hash], assetId: "arc-testnet:usdc" });
test("E: independent destination verification rejects wrong chain, payer, token, recipient and failed receipts", async () => {
  reset(); const proof = await verify(); assert.equal(proof.verified, true); assert.equal(proof.finalityConfirmed, true);
  for (const mutate of [() => { chainId = 84532; }, () => { transaction.from = recipient; }, () => { receipt.status = "reverted"; },
    () => { receipt.logs[0].address = recipient; }, () => { receipt.logs = []; }, () => { transaction.chainId = 84532; }]) {
    reset(); mutate(); await assert.rejects(verify());
  }
  reset(); currentBlock = 100n; assert.equal((await verify()).finalityConfirmed, false);
});

test("E: direct verification requires the payer Transfer log, recipient, amount and canonical block", async () => {
  const topics = (from, to) => viem.encodeEventTopics({
    abi: viem.parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"]),
    eventName: "Transfer", args: { from, to },
  });
  for (const mutate of [
    () => { receipt.logs[0].topics = topics(recipient, recipient); },
    () => { receipt.logs[0].topics = topics(payer, payer); },
    () => { receipt.logs.push(receipt.logs[0]); },
    () => { receipt.blockHash = hash; },
    () => { transaction.to = recipient; },
  ]) {
    reset(); mutate(); await assert.rejects(verify());
  }
  reset(); receipt.logs[0].data = viem.encodeAbiParameters([{ type: "uint256" }], [999999n]);
  assert.equal((await verify()).verified, false);
});
