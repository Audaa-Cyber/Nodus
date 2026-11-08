export type ProviderExecutionStatus =
  | "PENDING_DEPOSIT"
  | "KNOWN_DEPOSIT_TX"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "REFUNDED"
  | "INCOMPLETE_DEPOSIT";

export type ProviderExecutionResponse = {
  status: ProviderExecutionStatus;
  correlationId?: string;
  updatedAt?: string;
  quoteResponse?: {
    quoteRequest?: {
      dry?: boolean;
      swapType?: string;
      depositType?: string;
      recipientType?: string;
      originAsset?: string;
      destinationAsset?: string;
      amount?: string;
      recipient?: string;
      [key: string]: unknown;
    };
    quote?: {
      depositAddress?: string;
      amountOut?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  swapDetails?: {
    amountOut?: string;
    depositedAmount?: string | null;
    destinationChainTxHashes?: Array<{ hash: string; explorerUrl?: string }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type DestinationAssetInfo = {
  assetId: string;
  symbol: string;
  decimals: number;
  blockchain: string;
  contractAddress?: string | null;
};

export type AttemptForSettlement = {
  id: string;
  invoice_id: string;
  business_id: string;
  mode: "mock" | "live";
  status: string;
  source_asset_id: string;
  destination_asset_id: string;
  destination_network: string;
  recipient_address: string | null;
  deposit_address: string | null;
  quote_expires_at: string | null;
  transaction_hash: string | null;
  expected_received_amount: string | null;
  quote_snapshot: unknown;
};

export type InvoiceForSettlement = {
  id: string;
  business_id: string;
  status: string;
  currency: string;
  amount_minor: number | string;
};

export type DestinationTransferProof = {
  verified: boolean;
  assetId?: string;
  network: string;
  contractAddress: string;
  recipient: string;
  amount: string;
  transactionHashes: string[];
  finalityConfirmed: boolean;
};

export type SettlementDecision =
  | { kind: "simulation"; outcome: "SIMULATED_SUCCESS" | "SIMULATED_FAILED" | "SIMULATED_REFUNDED" | "SIMULATED_INCOMPLETE" }
  | { kind: "processing"; providerStatus: "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "PROCESSING" }
  | { kind: "expired" }
  | { kind: "terminal"; outcome: "FAILED" | "REFUNDED" | "INCOMPLETE_DEPOSIT"; providerStatus: string }
  | { kind: "verified"; outcome: "VERIFIED" | "PARTIAL" | "OVERPAID" | "REVIEW_REQUIRED"; amountBaseUnits: string; decimals: number; receivedValueMinor: string; assetId: string; network: string; recipient: string; transactionHashes: string[] }
  | { kind: "manual_review"; reason: string };

type ClassificationInput = {
  attempt: AttemptForSettlement;
  invoice: InvoiceForSettlement;
  execution: ProviderExecutionResponse;
  destinationAsset: DestinationAssetInfo;
  transferProof: DestinationTransferProof | null;
  quoteSignatureValid: boolean;
  now?: Date;
};

const PROVIDER_STATUSES = new Set([
  "PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS", "FAILED", "REFUNDED", "INCOMPLETE_DEPOSIT",
]);

const NETWORK_ALIASES: Record<string, string> = {
  eth: "ethereum", ethereum: "ethereum",
  arb: "arbitrum", arbitrum: "arbitrum",
  base: "base",
  op: "optimism", optimism: "optimism",
  pol: "polygon", polygon: "polygon",
  bsc: "bsc",
  avax: "avalanche", avalanche: "avalanche",
  sol: "solana", solana: "solana",
};

function normalizeNetwork(value: string | null | undefined): string | null {
  if (!value) return null;
  return NETWORK_ALIASES[value.trim().toLowerCase()] ?? null;
}

function sameAddress(network: string, left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  return network === "solana" ? left === right : left.toLowerCase() === right.toLowerCase();
}

function positiveInteger(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]+$/.test(value) && BigInt(value) > 0n;
}

/** Convert smallest units to invoice minor units as an exact decimal string. */
export function assetUnitsToInvoiceMinor(amount: string, decimals: number): string | null {
  if (!positiveInteger(amount) || !Number.isInteger(decimals) || decimals < 0 || decimals > 30) return null;
  const units = BigInt(amount);
  if (decimals <= 2) return (units * (10n ** BigInt(2 - decimals))).toString();

  const fractionalDigits = decimals - 2;
  const divisor = 10n ** BigInt(fractionalDigits);
  const whole = units / divisor;
  const remainder = units % divisor;
  if (remainder === 0n) return whole.toString();
  const fraction = remainder.toString().padStart(fractionalDigits, "0").replace(/0+$/, "");
  return `${whole}.${fraction}`;
}

function getOriginalQuote(attempt: AttemptForSettlement) {
  if (!attempt.quote_snapshot || typeof attempt.quote_snapshot !== "object") return null;
  const snapshot = attempt.quote_snapshot as Record<string, unknown>;
  if (!snapshot.quoteRequest || typeof snapshot.quoteRequest !== "object" || !snapshot.quote || typeof snapshot.quote !== "object") return null;
  return {
    request: snapshot.quoteRequest as Record<string, unknown>,
    quote: snapshot.quote as Record<string, unknown>,
  };
}

function manualReview(reason: string): SettlementDecision {
  return { kind: "manual_review", reason };
}

export function classifySettlement(input: ClassificationInput): SettlementDecision {
  const { attempt, invoice, execution, destinationAsset, transferProof, quoteSignatureValid } = input;
  const now = input.now ?? new Date();

  if (attempt.mode === "mock") {
    const simulatedOutcome = execution?.status === "SUCCESS" ? "SIMULATED_SUCCESS"
      : execution?.status === "REFUNDED" ? "SIMULATED_REFUNDED"
        : execution?.status === "INCOMPLETE_DEPOSIT" ? "SIMULATED_INCOMPLETE"
          : "SIMULATED_FAILED";
    return { kind: "simulation", outcome: simulatedOutcome };
  }
  if (attempt.mode !== "live") return manualReview("unsupported_payment_mode");
  if (invoice.id !== attempt.invoice_id) return manualReview("invoice_mismatch");
  if (invoice.business_id !== attempt.business_id) return manualReview("business_mismatch");
  if (!execution || !PROVIDER_STATUSES.has(execution.status)) return manualReview("invalid_provider_status");
  if (!quoteSignatureValid) return manualReview("invalid_provider_signature");

  if (execution.status === "FAILED" || execution.status === "REFUNDED" || execution.status === "INCOMPLETE_DEPOSIT") {
    return { kind: "terminal", outcome: execution.status, providerStatus: execution.status };
  }
  if (execution.status !== "SUCCESS") {
    const expiresAt = attempt.quote_expires_at ? Date.parse(attempt.quote_expires_at) : Number.NaN;
    if (execution.status === "PENDING_DEPOSIT" && !attempt.transaction_hash && Number.isFinite(expiresAt) && expiresAt <= now.getTime()) {
      return { kind: "expired" };
    }
    return { kind: "processing", providerStatus: execution.status as "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "PROCESSING" };
  }

  if (invoice.currency !== "USD" || destinationAsset.symbol.toUpperCase() !== "USDC") return manualReview("unsupported_invoice_asset_pair");
  if (!attempt.recipient_address || !attempt.deposit_address || !attempt.expected_received_amount) return manualReview("incomplete_payment_attempt");
  if (!Number.isInteger(destinationAsset.decimals) || destinationAsset.decimals < 2 || destinationAsset.decimals > 30) return manualReview("invalid_asset_decimals");
  if (!destinationAsset.contractAddress) return manualReview("asset_contract_missing");

  const configuredNetwork = normalizeNetwork(attempt.destination_network);
  const assetNetwork = normalizeNetwork(destinationAsset.blockchain);
  const proofNetwork = normalizeNetwork(transferProof?.network);
  if (!configuredNetwork || !assetNetwork || configuredNetwork !== assetNetwork || proofNetwork !== configuredNetwork) {
    return manualReview("destination_network_mismatch");
  }

  const responseQuote = execution.quoteResponse;
  const request = responseQuote?.quoteRequest;
  const quote = responseQuote?.quote;
  const original = getOriginalQuote(attempt);
  if (!request || !quote || !original) return manualReview("provider_quote_missing");
  if (request.dry !== false || request.swapType !== "EXACT_OUTPUT" || request.depositType !== "ORIGIN_CHAIN"
    || request.recipientType !== "DESTINATION_CHAIN") return manualReview("provider_quote_terms_mismatch");
  if (request.originAsset !== attempt.source_asset_id || request.destinationAsset !== attempt.destination_asset_id
    || request.destinationAsset !== destinationAsset.assetId
    || request.amount !== attempt.expected_received_amount || quote.amountOut !== attempt.expected_received_amount
    || quote.depositAddress !== attempt.deposit_address) return manualReview("provider_quote_asset_or_amount_mismatch");
  if (!sameAddress(configuredNetwork, request.recipient, attempt.recipient_address)
    || !sameAddress(configuredNetwork, original.request.recipient as string | undefined, attempt.recipient_address)
    || original.request.destinationAsset !== attempt.destination_asset_id
    || original.quote.depositAddress !== attempt.deposit_address
    || original.quote.amountOut !== attempt.expected_received_amount) return manualReview("provider_quote_recipient_mismatch");

  const actualAmount = execution.swapDetails?.amountOut;
  const providerHashes = execution.swapDetails?.destinationChainTxHashes?.map(({ hash }) => hash) ?? [];
  if (!positiveInteger(actualAmount) || !providerHashes.length || !transferProof?.verified || !transferProof.finalityConfirmed) {
    return manualReview("destination_transfer_unverified");
  }
  const uniqueProviderHashes = new Set(providerHashes);
  const uniqueProofHashes = new Set(transferProof.transactionHashes);
  if (uniqueProviderHashes.size !== providerHashes.length || uniqueProofHashes.size !== transferProof.transactionHashes.length
    || providerHashes.length !== transferProof.transactionHashes.length
    || providerHashes.some((hash) => !uniqueProofHashes.has(hash))) return manualReview("destination_transaction_mismatch");
  if (actualAmount !== transferProof.amount) return manualReview("destination_amount_mismatch");
  if (transferProof.assetId && transferProof.assetId !== destinationAsset.assetId) return manualReview("destination_asset_mismatch");
  if (transferProof.contractAddress.toLowerCase() !== destinationAsset.contractAddress.toLowerCase()) return manualReview("destination_asset_mismatch");
  if (!sameAddress(configuredNetwork, transferProof.recipient, attempt.recipient_address)) return manualReview("destination_recipient_mismatch");

  const dueMinor = BigInt(invoice.amount_minor);
  const receivedValueMinor = assetUnitsToInvoiceMinor(actualAmount, destinationAsset.decimals);
  if (receivedValueMinor === null) return manualReview("invalid_received_amount");
  const receivedScaled = BigInt(actualAmount) * 100n;
  const dueScaled = dueMinor * (10n ** BigInt(destinationAsset.decimals));
  const outcome = invoice.status !== "open" && invoice.status !== "overdue"
    ? "REVIEW_REQUIRED"
    : receivedScaled < dueScaled ? "PARTIAL" : receivedScaled > dueScaled ? "OVERPAID" : "VERIFIED";

  return {
    kind: "verified",
    outcome,
    amountBaseUnits: actualAmount,
    decimals: destinationAsset.decimals,
    receivedValueMinor,
    assetId: destinationAsset.assetId,
    network: configuredNetwork,
    recipient: attempt.recipient_address,
    transactionHashes: [...uniqueProofHashes],
  };
}
