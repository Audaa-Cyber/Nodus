import { keccak256, type Hex } from "viem";

export type ParsedCctpV2Message = {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  nonce: string;
  sender: string;
  recipient: string;
  destinationCaller: string;
  minFinalityThreshold: number;
  finalityThresholdExecuted: number;
  body: {
    version: number;
    burnToken: string;
    mintRecipient: string;
    amount: bigint;
    messageSender: string;
    maxFee: bigint;
    feeExecuted: bigint;
    expirationBlock: bigint;
    hookData: string;
  };
  bodyHex: string;
};

function readHex(hex: string, byteOffset: number, byteLength: number): string {
  const start = 2 + byteOffset * 2;
  const value = hex.slice(start, start + byteLength * 2);
  if (value.length !== byteLength * 2) throw new Error("malformed_cctp_v2_message");
  return `0x${value.toLowerCase()}`;
}

function asNumber(hex: string, offset: number, length: number): number {
  const value = Number(BigInt(readHex(hex, offset, length)));
  if (!Number.isSafeInteger(value)) throw new Error("malformed_cctp_v2_uint");
  return value;
}

export function addressToBytes32(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("invalid_evm_address");
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

export function verifyCctpSourceTransactionIdentity(input: {
  transactionChainId: number;
  expectedChainId: number;
  transactionFrom: string;
  payer: string;
  transactionTo: string | null;
  expectedFeeWrapper: string;
  receiptStatus: "success" | "reverted";
}): void {
  if (input.transactionChainId !== input.expectedChainId || input.receiptStatus !== "success") {
    throw new Error("cctp_source_transaction_failed_or_wrong_chain");
  }
  if (input.transactionFrom.toLowerCase() !== input.payer.toLowerCase()
    || !input.transactionTo
    || input.transactionTo.toLowerCase() !== input.expectedFeeWrapper.toLowerCase()) {
    throw new Error("cctp_source_payer_or_fee_wrapper_mismatch");
  }
}

export function verifyCctpSourceDebit(input: {
  transfers: Array<{ token: string; from: string; to: string; amount: bigint }>;
  canonicalUsdc: string;
  payer: string;
  feeWrapper: string;
  expectedTotalDebit: string;
}): void {
  if (!/^[1-9][0-9]*$/.test(input.expectedTotalDebit)) throw new Error("invalid_expected_source_debit");
  const matching = input.transfers.filter((transfer) =>
    transfer.token.toLowerCase() === input.canonicalUsdc.toLowerCase()
    && transfer.from.toLowerCase() === input.payer.toLowerCase()
    && transfer.to.toLowerCase() === input.feeWrapper.toLowerCase());
  if (matching.length !== 1 || matching[0].amount !== BigInt(input.expectedTotalDebit)) {
    throw new Error("cctp_source_debit_mismatch");
  }
}

export function verifyImmutableAttemptInvoiceBinding(input: {
  invoiceId: string;
  attemptInvoiceId: string;
  snapshot: Record<string, unknown>;
  invoiceAmountMinor: string;
  invoiceCurrency: string;
  expectedInvoiceAmountBaseUnits: string;
  attemptExpectedReceivedAmount: string;
  attemptRecipient: string;
  attemptDestinationNetwork: string;
  attemptDestinationAssetId: string;
  attemptSourceNetwork: string;
  attemptSourceAssetId: string;
}): string {
  const payer = input.snapshot.payer;
  if (input.attemptInvoiceId !== input.invoiceId || input.snapshot.invoiceId !== input.invoiceId
    || (input.snapshot.invoiceAmountMinor !== undefined && input.snapshot.invoiceAmountMinor !== input.invoiceAmountMinor)
    || (input.snapshot.invoiceCurrency !== undefined && input.snapshot.invoiceCurrency !== input.invoiceCurrency)
    || input.attemptExpectedReceivedAmount !== input.expectedInvoiceAmountBaseUnits
    || input.snapshot.minimumReceived !== input.expectedInvoiceAmountBaseUnits
    || String(input.snapshot.recipient ?? "").toLowerCase() !== input.attemptRecipient.toLowerCase()
    || input.snapshot.destinationNetwork !== input.attemptDestinationNetwork
    || input.snapshot.destinationAssetId !== input.attemptDestinationAssetId
    || input.snapshot.sourceNetwork !== input.attemptSourceNetwork
    || input.snapshot.sourceAssetId !== input.attemptSourceAssetId
    || typeof payer !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(payer)) {
    throw new Error("attempt_invoice_snapshot_mismatch");
  }
  return payer;
}

/** Parse the canonical CCTP V2 MessageV2 and BurnMessageV2 layouts. */
export function parseCctpV2Message(message: string): ParsedCctpV2Message {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(message) || (message.length - 2) / 2 < 148 + 228) {
    throw new Error("malformed_cctp_v2_message");
  }
  const bodyHex = `0x${message.slice(2 + 148 * 2).toLowerCase()}`;
  const parsed: ParsedCctpV2Message = {
    version: asNumber(message, 0, 4),
    sourceDomain: asNumber(message, 4, 4),
    destinationDomain: asNumber(message, 8, 4),
    nonce: readHex(message, 12, 32),
    sender: readHex(message, 44, 32),
    recipient: readHex(message, 76, 32),
    destinationCaller: readHex(message, 108, 32),
    minFinalityThreshold: asNumber(message, 140, 4),
    finalityThresholdExecuted: asNumber(message, 144, 4),
    bodyHex,
    body: {
      version: asNumber(bodyHex, 0, 4),
      burnToken: readHex(bodyHex, 4, 32),
      mintRecipient: readHex(bodyHex, 36, 32),
      amount: BigInt(readHex(bodyHex, 68, 32)),
      messageSender: readHex(bodyHex, 100, 32),
      maxFee: BigInt(readHex(bodyHex, 132, 32)),
      feeExecuted: BigInt(readHex(bodyHex, 164, 32)),
      expirationBlock: BigInt(readHex(bodyHex, 196, 32)),
      hookData: `0x${bodyHex.slice(2 + 228 * 2).toLowerCase()}`,
    },
  };
  if (parsed.version !== 1 || parsed.body.version !== 1 || parsed.nonce === `0x${"0".repeat(64)}`) {
    throw new Error("unsupported_or_uninitialized_cctp_v2_message");
  }
  return parsed;
}

export type DepositForBurnV2Evidence = {
  burnToken: string;
  amount: bigint;
  depositor: string;
  mintRecipient: string;
  destinationDomain: number;
  destinationTokenMessenger: string;
  destinationCaller: string;
  maxFee: bigint;
  minFinalityThreshold: number;
  hookData: string;
};

/**
 * Link the source DepositForBurn event and source MessageSent message to
 * Circle IRIS's attested canonical V2 message. V2 attestation may update
 * finalityExecuted, feeExecuted and expirationBlock, so compare only fields
 * whose semantics are invariant across that transition.
 */
export function verifyCctpV2SourceMessage(input: {
  sourceMessage: string;
  attestedMessage: string;
  deposit: DepositForBurnV2Evidence;
  sourceDomain: number;
  destinationDomain: number;
  sourceUsdc: string;
  sourceTokenMessenger: string;
  destinationTokenMessenger: string;
  minimumReceived: string;
  payer: string;
  merchantRecipient: string;
  feeWrapper?: string;
}): { nonce: string; messageHash: string; bodyHex: string; amount: string; finalityThresholdExecuted: number } {
  const source = parseCctpV2Message(input.sourceMessage);
  const attested = parseCctpV2Message(input.attestedMessage);
  const deposit = input.deposit;
  const expectedSender = addressToBytes32(input.sourceTokenMessenger);
  const expectedRecipient = addressToBytes32(input.destinationTokenMessenger);
  const expectedBurnToken = addressToBytes32(input.sourceUsdc);
  const expectedMerchantRecipient = addressToBytes32(input.merchantRecipient);
  const expectedForwardingHook = "0x636374702d666f72776172640000000000000000000000000000000000000000";
  const expectedAmount = BigInt(input.minimumReceived);
  const allowedDepositors = [input.feeWrapper?.toLowerCase() ?? input.payer.toLowerCase()];

  for (const message of [source, attested]) {
    if (message.sourceDomain !== input.sourceDomain || message.destinationDomain !== input.destinationDomain
      || message.sender !== expectedSender || message.recipient !== expectedRecipient
      || message.body.burnToken !== expectedBurnToken || message.body.amount !== expectedAmount
      || message.body.mintRecipient !== expectedMerchantRecipient
      || message.body.messageSender !== addressToBytes32(deposit.depositor)
      || message.body.hookData !== expectedForwardingHook
      || message.body.hookData !== deposit.hookData.toLowerCase()) {
      throw new Error("cctp_source_message_terms_mismatch");
    }
  }
  if (source.nonce !== attested.nonce
    || source.destinationCaller !== attested.destinationCaller
    || source.minFinalityThreshold !== attested.minFinalityThreshold
    || source.body.maxFee !== attested.body.maxFee
    || deposit.burnToken.toLowerCase() !== input.sourceUsdc.toLowerCase()
    || deposit.amount !== expectedAmount
    || !allowedDepositors.includes(deposit.depositor.toLowerCase())
    || deposit.destinationDomain !== input.destinationDomain
    || deposit.mintRecipient.toLowerCase() !== expectedMerchantRecipient
    || deposit.destinationTokenMessenger.toLowerCase() !== expectedRecipient
    || deposit.destinationCaller.toLowerCase() !== source.destinationCaller
    || deposit.minFinalityThreshold !== source.minFinalityThreshold
    || deposit.maxFee !== source.body.maxFee) {
    throw new Error("cctp_source_burn_mismatch");
  }

  return {
    nonce: attested.nonce,
    messageHash: keccak256(input.attestedMessage as Hex),
    bodyHex: attested.bodyHex,
    amount: attested.body.amount.toString(),
    finalityThresholdExecuted: attested.finalityThresholdExecuted,
  };
}

export function verifyCctpV2DestinationMessage(input: {
  sourceDomain: number;
  expectedSourceDomain: number;
  nonce: string;
  expectedNonce: string;
  sourceTokenMessenger: string;
  finalityThresholdExecuted: number;
  expectedFinalityThresholdExecuted: number;
  messageBody: string;
  canonicalBody: string;
}): void {
  if (input.sourceDomain !== input.expectedSourceDomain || !/^0x[0-9a-fA-F]{64}$/.test(input.nonce)
    || input.nonce === `0x${"0".repeat(64)}`
    || input.nonce.toLowerCase() !== input.expectedNonce.toLowerCase()
    || !/^0x[0-9a-fA-F]{64}$/.test(input.sourceTokenMessenger)
    || input.finalityThresholdExecuted <= 0
    || input.finalityThresholdExecuted !== input.expectedFinalityThresholdExecuted
    || input.messageBody.toLowerCase() !== input.canonicalBody.toLowerCase()) {
    throw new Error("cctp_destination_message_mismatch");
  }
}

export function verifyUniqueMerchantTransfer(input: {
  transfers: Array<{ token: string; recipient: string; amount: bigint }>;
  canonicalUsdc: string;
  merchantRecipient: string;
  minimumReceived: string;
}): string {
  if (!/^[1-9][0-9]*$/.test(input.minimumReceived)) throw new Error("invalid_minimum_received");
  const matching = input.transfers.filter((transfer) =>
    transfer.token.toLowerCase() === input.canonicalUsdc.toLowerCase()
    && transfer.recipient.toLowerCase() === input.merchantRecipient.toLowerCase());
  if (matching.length !== 1 || matching[0].amount < BigInt(input.minimumReceived)) {
    throw new Error("cctp_destination_usdc_delivery_mismatch");
  }
  return matching[0].amount.toString();
}

export function verifyCctpDestinationReceiptIdentity(input: {
  transactionChainId: number | undefined;
  expectedChainId: number;
  receiptStatus: "success" | "reverted";
}): void {
  if (input.transactionChainId !== input.expectedChainId || input.receiptStatus !== "success") {
    throw new Error("cctp_destination_transaction_failed_or_wrong_chain");
  }
}

export function hasRequiredConfirmations(input: {
  currentBlock: bigint;
  receiptBlock: bigint;
  requiredConfirmations: number;
}): boolean {
  if (!Number.isInteger(input.requiredConfirmations) || input.requiredConfirmations < 1) {
    throw new Error("invalid_confirmation_threshold");
  }
  return input.currentBlock + 1n >= input.receiptBlock + BigInt(input.requiredConfirmations);
}

export function isIrisMessageBoundToSource(input: {
  reportedSourceTxHash: string | undefined;
  requestedSourceTxHash: string;
  sourceDomain: string | undefined;
  expectedSourceDomain: number;
  destinationDomain: string | undefined;
  expectedDestinationDomain: number;
}): boolean {
  return Boolean(input.reportedSourceTxHash
    && input.reportedSourceTxHash.toLowerCase() === input.requestedSourceTxHash.toLowerCase()
    && input.sourceDomain === String(input.expectedSourceDomain)
    && input.destinationDomain === String(input.expectedDestinationDomain));
}

