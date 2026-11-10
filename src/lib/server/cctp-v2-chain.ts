import "server-only";

import {
  createPublicClient, http, isAddressEqual, parseAbi, parseEventLogs,
  type Address, type Hash,
} from "viem";
import { evmWalletChains, getWalletNetwork } from "@/lib/wallet/networks";
import { getCircleChain } from "@/lib/server/circle";
import {
  addressToBytes32, verifyCctpV2DestinationMessage, verifyCctpV2SourceMessage,
  hasRequiredConfirmations, verifyCctpDestinationReceiptIdentity,
  verifyCctpSourceDebit, verifyCctpSourceTransactionIdentity, verifyUniqueMerchantTransfer,
  type DepositForBurnV2Evidence,
} from "@/lib/payments/cctp-v2-integrity";

const depositAbi = parseAbi(["event DepositForBurn(address indexed burnToken,uint256 amount,address indexed depositor,bytes32 mintRecipient,uint32 destinationDomain,bytes32 destinationTokenMessenger,bytes32 destinationCaller,uint256 maxFee,uint32 indexed minFinalityThreshold,bytes hookData)"]);
const sentAbi = parseAbi(["event MessageSent(bytes message)"]);
const receivedAbi = parseAbi(["event MessageReceived(address indexed caller,uint32 sourceDomain,bytes32 indexed nonce,bytes32 sender,uint32 indexed finalityThresholdExecuted,bytes messageBody)"]);
const transferAbi = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
const HASH = /^0x[0-9a-fA-F]{64}$/;

function envMap<T>(name: string): Record<string, T> {
  try {
    const value: unknown = JSON.parse(process.env[name] ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, T> : {};
  } catch { return {}; }
}

function clientFor(network: string) {
  const walletNetwork = getWalletNetwork(network);
  const rpcUrl = envMap<string>("SETTLEMENT_RPC_URLS_JSON")[network];
  const chain = walletNetwork?.chainId && evmWalletChains.find((item) => item.id === walletNetwork.chainId);
  if (!walletNetwork || walletNetwork.family !== "evm" || !chain || !rpcUrl || !/^https:\/\//i.test(rpcUrl)) {
    throw new Error("cctp_verification_rpc_not_configured");
  }
  return createPublicClient({ chain, transport: http(rpcUrl, { timeout: 12_000, retryCount: 1 }) });
}

export type VerifiedCctpSource = {
  sourceTransactionHash: string;
  payer: string;
  amount: string;
  nonce: string;
  messageHash: string;
  message: string;
  messageBody: string;
  finalityThresholdExecuted: number;
};

/** Independently verify the Base Sepolia burn and bind its V2 message to IRIS. */
export async function verifyCctpV2SourceTransaction(input: {
  sourceTxHash: string;
  payer: string;
  destinationNetwork: string;
  expectedBurnAmount: string;
  expectedSourceDebitAmount: string;
  merchantRecipient: string;
  attestedMessage: string;
}): Promise<VerifiedCctpSource> {
  if (!HASH.test(input.sourceTxHash) || !/^0x[0-9a-fA-F]{40}$/.test(input.payer)
    || !/^[1-9][0-9]*$/.test(input.expectedBurnAmount)) throw new Error("invalid_cctp_source_proof_request");
  const source = getCircleChain("base-sepolia", true);
  const destination = getCircleChain(input.destinationNetwork, true);
  if (!source?.messageTransmitterV2 || !source.tokenMessengerWithFees
    || !destination?.messageTransmitterV2) throw new Error("cctp_v2_chain_configuration_missing");
  const client = clientFor("base-sepolia");
  const hash = input.sourceTxHash as Hash;
  const [transaction, receipt] = await Promise.all([
    client.getTransaction({ hash }),
    client.getTransactionReceipt({ hash }),
  ]);
  verifyCctpSourceTransactionIdentity({
    transactionChainId: transaction.chainId ?? 0,
    expectedChainId: source.chainId,
    transactionFrom: transaction.from,
    payer: input.payer,
    transactionTo: transaction.to,
    expectedFeeWrapper: source.tokenMessengerWithFees,
    receiptStatus: receipt.status,
  });

  const depositLogs = parseEventLogs({ abi: depositAbi, logs: receipt.logs, strict: false, eventName: "DepositForBurn" })
    .filter((log) => log.address && isAddressEqual(log.address, source.tokenMessengerAddress as Address));
  const sentLogs = parseEventLogs({ abi: sentAbi, logs: receipt.logs, strict: false, eventName: "MessageSent" })
    .filter((log) => log.address && isAddressEqual(log.address, source.messageTransmitterV2 as Address));
  if (depositLogs.length !== 1 || sentLogs.length !== 1) throw new Error("cctp_source_event_count_mismatch");
  const sourceTransfers = parseEventLogs({
    abi: transferAbi, logs: receipt.logs, strict: false, eventName: "Transfer",
  }).filter((log) => log.address && log.args.from && log.args.to && log.args.value !== undefined)
    .map((log) => ({ token: log.address, from: log.args.from!, to: log.args.to!, amount: log.args.value! }));
  verifyCctpSourceDebit({
    transfers: sourceTransfers,
    canonicalUsdc: source.usdcAddress,
    payer: input.payer,
    feeWrapper: source.tokenMessengerWithFees,
    expectedTotalDebit: input.expectedSourceDebitAmount,
  });
  const event = depositLogs[0];
  const sent = sentLogs[0];
  if (!event.args.burnToken || event.args.amount === undefined || !event.args.depositor
    || !event.args.mintRecipient || event.args.destinationDomain === undefined
    || !event.args.destinationTokenMessenger || !event.args.destinationCaller
    || event.args.maxFee === undefined || event.args.minFinalityThreshold === undefined
    || !event.args.hookData || !sent.args.message) throw new Error("cctp_source_event_malformed");

  const deposit: DepositForBurnV2Evidence = {
    burnToken: event.args.burnToken,
    amount: event.args.amount,
    depositor: event.args.depositor,
    mintRecipient: event.args.mintRecipient,
    destinationDomain: event.args.destinationDomain,
    destinationTokenMessenger: event.args.destinationTokenMessenger,
    destinationCaller: event.args.destinationCaller,
    maxFee: event.args.maxFee,
    minFinalityThreshold: event.args.minFinalityThreshold,
    hookData: event.args.hookData,
  };
  const correlation = verifyCctpV2SourceMessage({
    sourceMessage: sent.args.message,
    attestedMessage: input.attestedMessage,
    deposit,
    sourceDomain: source.cctpDomainId,
    destinationDomain: destination.cctpDomainId,
    sourceUsdc: source.usdcAddress,
    sourceTokenMessenger: source.tokenMessengerAddress,
    destinationTokenMessenger: destination.tokenMessengerAddress,
    minimumReceived: input.expectedBurnAmount,
    payer: input.payer,
    merchantRecipient: input.merchantRecipient,
    feeWrapper: source.tokenMessengerWithFees,
  });
  return {
    sourceTransactionHash: input.sourceTxHash,
    payer: input.payer,
    amount: correlation.amount,
    nonce: correlation.nonce,
    messageHash: correlation.messageHash,
    message: input.attestedMessage,
    messageBody: correlation.bodyHex,
    finalityThresholdExecuted: correlation.finalityThresholdExecuted,
  };
}

/** Verify Circle's candidate transaction contains both CCTP V2 receive and the merchant USDC delivery. */
export async function verifyCctpV2DestinationTransaction(input: {
  destinationNetwork: string;
  destinationTxHashes: string[];
  sourceNetwork: string;
  source: VerifiedCctpSource;
  recipient: string;
  minimumReceived: string;
  assetId: string;
}): Promise<{ verified: boolean; finalityConfirmed: boolean; amount: string; transactionHashes: string[] }> {
  if (!input.destinationTxHashes.length || input.destinationTxHashes.length > 2
    || input.destinationTxHashes.some((hash) => !HASH.test(hash))
    || new Set(input.destinationTxHashes.map((hash) => hash.toLowerCase())).size !== input.destinationTxHashes.length
    || !/^0x[0-9a-fA-F]{40}$/.test(input.recipient)
    || !/^[1-9][0-9]*$/.test(input.minimumReceived)) {
    throw new Error("invalid_cctp_destination_proof_request");
  }
  const destination = getCircleChain(input.destinationNetwork, true);
  const source = getCircleChain(input.sourceNetwork, true);
  if (!destination?.messageTransmitterV2 || !source?.tokenMessengerAddress) {
    throw new Error("cctp_v2_chain_configuration_missing");
  }
  if (input.assetId !== `${input.destinationNetwork}:usdc`) {
    throw new Error("cctp_destination_asset_mismatch");
  }
  const client = clientFor(input.destinationNetwork);
  const receipts = await Promise.all(input.destinationTxHashes.map(async (txHash) => {
    const hash = txHash as Hash;
    const [receipt, tx] = await Promise.all([client.getTransactionReceipt({ hash }), client.getTransaction({ hash })]);
    verifyCctpDestinationReceiptIdentity({
      transactionChainId: tx.chainId,
      expectedChainId: destination.chainId,
      receiptStatus: receipt.status,
    });
    return { hash, receipt };
  }));
  const messages = receipts.flatMap(({ hash, receipt }) => parseEventLogs({
    abi: receivedAbi, logs: receipt.logs, strict: false, eventName: "MessageReceived",
  }).filter((log) => log.address && isAddressEqual(log.address, destination.messageTransmitterV2 as Address))
    .filter((log) => log.args.sourceDomain === source.cctpDomainId
      && log.args.nonce?.toLowerCase() === input.source.nonce.toLowerCase()
      && log.args.sender?.toLowerCase() === addressToBytes32(source.tokenMessengerAddress).toLowerCase()
      && typeof log.args.messageBody === "string"
      && log.args.messageBody.toLowerCase() === input.source.messageBody.toLowerCase())
    .map((log) => ({ log, receiptHash: hash })));
  if (messages.length !== 1) throw new Error("cctp_destination_message_correlation_failed");
  const { log: received } = messages[0];
  verifyCctpV2DestinationMessage({
    sourceDomain: received.args.sourceDomain!,
    expectedSourceDomain: source.cctpDomainId,
    nonce: received.args.nonce!,
    expectedNonce: input.source.nonce,
    sourceTokenMessenger: received.args.sender!,
    finalityThresholdExecuted: received.args.finalityThresholdExecuted!,
    expectedFinalityThresholdExecuted: input.source.finalityThresholdExecuted,
    messageBody: received.args.messageBody!,
    canonicalBody: input.source.messageBody,
  });

  const transfers = receipts.flatMap(({ hash, receipt }) => parseEventLogs({
    abi: transferAbi, logs: receipt.logs, strict: false, eventName: "Transfer",
  }).filter((log) => log.address && isAddressEqual(log.address, destination.usdcAddress as Address))
    .filter((log) => log.args.to)
    .map((log) => ({ log, receiptHash: hash })));
  const receivedAmount = verifyUniqueMerchantTransfer({
    transfers: transfers.flatMap(({ log }) => log.args.to && log.args.value !== undefined
      ? [{ token: log.address, recipient: log.args.to, amount: log.args.value }]
      : []),
    canonicalUsdc: destination.usdcAddress,
    merchantRecipient: input.recipient,
    minimumReceived: input.minimumReceived,
  });
  const confirmations = envMap<number>("SETTLEMENT_CONFIRMATIONS_JSON")[input.destinationNetwork];
  if (!Number.isInteger(confirmations) || confirmations < 1 || confirmations > 10_000) {
    throw new Error("settlement_chain_not_configured");
  }
  const current = await client.getBlockNumber();
  const finalityConfirmed = receipts.every(({ receipt }) => hasRequiredConfirmations({
    currentBlock: current,
    receiptBlock: receipt.blockNumber,
    requiredConfirmations: confirmations,
  }));
  return {
    verified: true,
    finalityConfirmed,
    amount: receivedAmount,
    transactionHashes: input.destinationTxHashes,
  };
}
