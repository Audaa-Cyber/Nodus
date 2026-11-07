import "server-only";

import { createPublicClient, http, isAddress, isAddressEqual, parseAbi, parseEventLogs, type Address, type Hash } from "viem";
import { evmWalletChains, getWalletNetwork } from "@/lib/wallet/networks";
import type { DestinationTransferProof } from "@/lib/payments/settlement-policy";

const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const HASH = /^0x[0-9a-fA-F]{64}$/;

function readJsonMap<T>(name: string): Record<string, T> {
  try {
    const raw = process.env[name];
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, T> : {};
  } catch { return {}; }
}

async function deadline<T>(promise: Promise<T>, ms = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("settlement_rpc_timeout")), ms);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

/** Fail-closed EVM ERC-20 destination verification. Solana verification is deliberately unsupported. */
export async function verifyEvmDestinationTransfers(input: {
  network: string;
  contractAddress: string;
  recipient: string;
  amount: string;
  transactionHashes: string[];
  assetId: string;
}): Promise<DestinationTransferProof> {
  const network = getWalletNetwork(input.network);
  if (!network || network.family !== "evm" || !input.contractAddress || !isAddress(input.contractAddress)
    || !isAddress(input.recipient) || !/^[1-9][0-9]*$/.test(input.amount)
    || input.transactionHashes.length < 1 || input.transactionHashes.length > 16
    || input.transactionHashes.some((hash) => !HASH.test(hash))
    || new Set(input.transactionHashes).size !== input.transactionHashes.length) {
    throw new Error("unsupported_or_invalid_destination_proof");
  }
  const key = network.key;
  const rpcUrl = readJsonMap<string>("SETTLEMENT_RPC_URLS_JSON")[key];
  const confirmations = readJsonMap<number>("SETTLEMENT_CONFIRMATIONS_JSON")[key];
  if (!rpcUrl || !/^https:\/\//i.test(rpcUrl) || !Number.isInteger(confirmations) || confirmations < 1 || confirmations > 10_000) {
    throw new Error("settlement_chain_not_configured");
  }
  const chain = evmWalletChains.find((candidate) => candidate.id === network.chainId);
  if (!chain) throw new Error("settlement_chain_unsupported");
  const client = createPublicClient({ chain, transport: http(rpcUrl, { timeout: 12_000, retryCount: 1 }) });
  let received = 0n;
  let finalityConfirmed = true;
  const hashes = input.transactionHashes as Hash[];
  for (const hash of hashes) {
    const receipt = await deadline(client.getTransactionReceipt({ hash }));
    if (receipt.status !== "success") throw new Error("destination_transaction_failed");
    const currentBlock = await deadline(client.getBlockNumber());
    if (currentBlock + 1n < receipt.blockNumber + BigInt(confirmations)) finalityConfirmed = false;
    const logs = parseEventLogs({ abi: transferAbi, logs: receipt.logs, strict: false, eventName: "Transfer" });
    for (const log of logs) {
      if (!log.address || !isAddressEqual(log.address, input.contractAddress as Address)) continue;
      if (!log.args.to || !isAddressEqual(log.args.to, input.recipient as Address)) continue;
      if (typeof log.args.value === "bigint") received += log.args.value;
    }
  }
  return {
    verified: received > 0n,
    assetId: input.assetId,
    network: key,
    contractAddress: input.contractAddress,
    recipient: input.recipient,
    amount: received.toString(),
    transactionHashes: [...hashes],
    finalityConfirmed,
  };
}
