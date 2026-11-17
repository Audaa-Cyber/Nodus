import { createHash } from "node:crypto";
import { getCircleChain } from "../server/circle.ts";

import { circleTestnetUsdcNetworks } from "../wallet/networks.ts";

function settlementChain(network: string) {
  if (!circleTestnetUsdcNetworks.some((candidate) => candidate.key === network)) return null;
  const chain = getCircleChain(network, true);
  return chain ? { ...chain, token: chain.usdcAddress.toLowerCase() } : null;
}
const VERIFIER_POLICY_VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;

export type NearAttestationInput = {
  reconciliation_id: string;
  attempt_id: string;
  source_chain_id: number;
  source_transaction_hash: string;
  source_block_number: number;
  source_block_hash: string;
  cctp_source_domain: number;
  cctp_message_nonce: string;
  cctp_message_hash: string;
  destination_chain_id: number;
  destination_transaction_hash: string;
  destination_block_number: number;
  destination_block_hash: string;
  token_address: string;
  merchant_recipient: string;
  amount_base_units: string;
  token_decimals: number;
  verifier_policy_version: number;
  evidence_digest: string;
};

type JsonMap = Record<string, unknown>;

export type NearSettlementPayload = {
  invoiceArgs: {
    invoice_id: string;
    terms: {
      currency: "USD";
      amount_minor: string;
      destination_chain_id: number;
      token_decimals: 6;
      token_address: string;
      merchant_recipient: string;
    };
  };
  attemptArgs: { attempt_id: string; invoice_id: string; source_chain_id: number };
  attestationArgs: { input: NearAttestationInput };
};

function invalid(code: string): never {
  const error = new Error(code) as Error & { code: string; permanent: boolean };
  error.code = code;
  error.permanent = true;
  throw error;
}

function map(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function canonicalUuid(value: unknown): string {
  const id = text(value).toLowerCase();
  if (!UUID.test(id)) invalid("near_identifier_invalid");
  return id;
}

function canonicalHash(value: unknown): string {
  const hash = text(value).toLowerCase();
  if (!HASH.test(hash)) invalid("near_evidence_hash_invalid");
  return hash;
}

function canonicalAddress(value: unknown): string {
  const address = text(value).toLowerCase();
  if (!ADDRESS.test(address)) invalid("near_evidence_address_invalid");
  return address;
}

function positiveDecimal(value: unknown): string {
  const amount = typeof value === "string" ? value : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";
  if (!/^[1-9][0-9]*$/.test(amount) || BigInt(amount) > (1n << 128n) - 1n) invalid("near_amount_invalid");
  return amount;
}

function safeU64(value: unknown): number {
  let parsed: bigint;
  try {
    parsed = BigInt(typeof value === "number" && Number.isSafeInteger(value) ? value : text(value));
  } catch { return invalid("near_evidence_integer_invalid"); }
  if (parsed <= 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) invalid("near_evidence_integer_unsupported");
  return Number(parsed);
}

function safeU32(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 0xffff_ffff) {
    return invalid("near_evidence_source_domain_invalid");
  }
  return Number(value);
}

function canonicalCctpNonce(value: unknown): string {
  if (typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)) {
    return value.toLowerCase();
  }
  const decimalStr = typeof value === "string" ? value : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";
  if (/^[1-9][0-9]*$/.test(decimalStr)) {
    const parsed = BigInt(decimalStr);
    if (parsed > 0n && parsed < (1n << 256n)) {
      return `0x${parsed.toString(16).padStart(64, "0")}`;
    }
  }
  return invalid("near_evidence_nonce_invalid");
}

function uuidBytes(value: string): Buffer {
  return Buffer.from(value.replaceAll("-", ""), "hex");
}

function hexBytes(value: string): Buffer {
  return Buffer.from(value.slice(2), "hex");
}

function uintBytes(value: number | string, length: number): Buffer {
  let number: bigint;
  try { number = BigInt(value); } catch { return invalid("near_evidence_integer_invalid"); }
  if (number < 0n || number >= (1n << BigInt(length * 8))) invalid("near_evidence_integer_invalid");
  const bytes = Buffer.alloc(length);
  for (let i = length - 1; i >= 0; i -= 1) {
    bytes[i] = Number(number & 0xffn);
    number >>= 8n;
  }
  return bytes;
}

export function nearEvidenceDigest(invoiceId: string, input: Omit<NearAttestationInput, "evidence_digest">): string {
  const encoded = Buffer.concat([
    Buffer.from("NODUS_CCTP_SETTLEMENT_EVIDENCE_V2\0", "utf8"),
    uuidBytes(invoiceId),
    uuidBytes(input.reconciliation_id),
    uuidBytes(input.attempt_id),
    uintBytes(input.source_chain_id, 8),
    hexBytes(input.source_transaction_hash),
    uintBytes(input.source_block_number, 8),
    hexBytes(input.source_block_hash),
    uintBytes(input.cctp_source_domain, 4),
    hexBytes(input.cctp_message_nonce),
    hexBytes(input.cctp_message_hash),
    uintBytes(input.destination_chain_id, 8),
    hexBytes(input.destination_transaction_hash),
    uintBytes(input.destination_block_number, 8),
    hexBytes(input.destination_block_hash),
    hexBytes(input.token_address),
    hexBytes(input.merchant_recipient),
    uintBytes(input.amount_base_units, 16),
    Buffer.from([input.token_decimals]),
    uintBytes(input.verifier_policy_version, 4),
  ]);
  return `0x${createHash("sha256").update(encoded).digest("hex")}`;
}

/** Builds the exact register and attest arguments from the server-verified database settlement. */
export function buildNearSettlementPayload(input: {
  settlement: JsonMap;
  attempt: JsonMap;
  invoice: JsonMap;
  canonicalTokenAddress: string;
}): NearSettlementPayload {
  const { settlement, attempt, invoice } = input;
  const attemptId = canonicalUuid(attempt.id);
  const invoiceId = canonicalUuid(invoice.id);
  const reconciliationId = canonicalUuid(settlement.id);
  if (canonicalUuid(settlement.payment_attempt_id) !== attemptId
    || canonicalUuid(settlement.invoice_id) !== invoiceId
    || canonicalUuid(attempt.invoice_id) !== invoiceId
    || text(settlement.provider_status) !== "SUCCESS"
    || !["VERIFIED", "PARTIAL", "OVERPAID", "REVIEW_REQUIRED"].includes(text(settlement.outcome))) {
    invalid("near_settlement_record_ineligible");
  }
  const snapshot = map(attempt.quote_snapshot);
  const isDirect = text(snapshot.type) === "circle_direct";
  const sourceNetwork = text(attempt.source_network);
  const destinationNetwork = text(attempt.destination_network);
  const sourceChain = settlementChain(sourceNetwork);
  const destinationChain = settlementChain(destinationNetwork);
  if ((!isDirect && text(snapshot.type) !== "circle_cctp") || text(attempt.mode) !== "live"
    || !sourceChain || !destinationChain || (isDirect ? sourceChain.chainId !== destinationChain.chainId : sourceChain.chainId === destinationChain.chainId)
    || text(attempt.source_asset_id) !== `${sourceNetwork}:usdc`
    || text(attempt.destination_asset_id) !== `${destinationNetwork}:usdc`
    || text(settlement.destination_network) !== destinationNetwork
    || text(settlement.destination_asset_id) !== `${destinationNetwork}:usdc`) {
    invalid("near_settlement_route_unsupported");
  }
  if (text(invoice.currency).toUpperCase() !== "USD") invalid("near_invoice_currency_unsupported");
  if (!Number.isSafeInteger(invoice.amount_minor) || Number(invoice.amount_minor) < 1) invalid("near_invoice_amount_invalid");

  const evidence = map(settlement.evidence);
  const directProof = map(evidence.destinationProof);
  const directTransaction = map(Array.isArray(directProof.transactions) ? directProof.transactions[0] : null);
  if (isDirect && (evidence.routeType !== "same_chain"
    || canonicalAddress(directProof.payer) !== canonicalAddress(snapshot.payer)
    || canonicalAddress(directProof.contractAddress) !== canonicalAddress(input.canonicalTokenAddress)
    || canonicalAddress(directProof.recipient) !== canonicalAddress(attempt.recipient_address)
    || canonicalHash(directTransaction.transactionHash) !== canonicalHash(attempt.transaction_hash))) {
    invalid("near_direct_evidence_mismatch");
  }
  // ABI compatibility only: direct identifiers are derived from the verified
  // transaction in a separate namespace. They are never CCTP settlement proof.
  const directIdentifier = `0x${createHash("sha256").update(`NODUS_DIRECT_USDC_V1:${sourceNetwork}:${text(attempt.transaction_hash).toLowerCase()}`).digest("hex")}`;
  const sourceProof = isDirect ? {
    sourceTransactionHash: attempt.transaction_hash,
    sourceBlockNumber: directTransaction.blockNumber, sourceBlockHash: directTransaction.blockHash,
    nonce: directIdentifier, messageHash: directIdentifier, sourceDomain: sourceChain.cctpDomainId,
  } : map(evidence.sourceProof);
  const destinationProof = map(evidence.destinationProof);
  if (destinationProof.verified !== true || destinationProof.finalityConfirmed !== true) {
    invalid("near_destination_evidence_unverified");
  }
  const sourceTransactionHash = canonicalHash(attempt.transaction_hash);
  if (canonicalHash(sourceProof.sourceTransactionHash) !== sourceTransactionHash) invalid("near_source_transaction_mismatch");
  const destinationHashes = Array.isArray(settlement.destination_tx_hashes)
    ? settlement.destination_tx_hashes.map(canonicalHash) : [];
  const proofHashes = Array.isArray(destinationProof.transactionHashes)
    ? destinationProof.transactionHashes.map(canonicalHash) : [];
  if (destinationHashes.length !== 1 || proofHashes.length !== 1) invalid("near_destination_transaction_count_unsupported");
  if (destinationHashes[0] !== proofHashes[0]) invalid("near_destination_transaction_mismatch");
  if (positiveDecimal(destinationProof.amount) !== positiveDecimal(settlement.received_amount_base_units)) {
    invalid("near_destination_amount_mismatch");
  }
  const transactionDetails = Array.isArray(destinationProof.transactions) ? destinationProof.transactions : [];
  if (transactionDetails.length !== 1) invalid("near_destination_transaction_metadata_missing");
  const destinationTransaction = map(transactionDetails[0]);
  const destinationTransactionHash = canonicalHash(destinationTransaction.transactionHash);
  if (destinationTransactionHash !== destinationHashes[0]) invalid("near_destination_transaction_mismatch");

  const tokenAddress = canonicalAddress(input.canonicalTokenAddress);
  if (tokenAddress !== destinationChain.token || sourceChain.token !== text(snapshot.sourceUsdc).toLowerCase()) {
    invalid("near_route_token_mismatch");
  }
  const merchantRecipient = canonicalAddress(attempt.recipient_address);
  if (canonicalAddress(settlement.recipient_address) !== merchantRecipient) invalid("near_recipient_mismatch");
  if (Number(settlement.received_asset_decimals) !== 6) invalid("near_token_decimals_unsupported");
  const amount = positiveDecimal(settlement.received_amount_base_units);
  const baseMinor = positiveDecimal(invoice.amount_minor);
  const terms = {
    currency: "USD" as const,
    amount_minor: baseMinor,
    destination_chain_id: destinationChain.chainId,
    token_decimals: 6 as const,
    token_address: tokenAddress,
    merchant_recipient: merchantRecipient,
  };
  const sourceBlockNumber = safeU64(sourceProof.sourceBlockNumber);
  const destinationBlockNumber = safeU64(destinationTransaction.blockNumber);
  const nonce = canonicalCctpNonce(sourceProof.nonce);
  const cctpSourceDomain = safeU32(sourceProof.sourceDomain ?? snapshot.sourceDomain);
  if (cctpSourceDomain !== sourceChain.cctpDomainId) invalid("near_evidence_source_domain_mismatch");
  const digestInput: Omit<NearAttestationInput, "evidence_digest"> = {
    reconciliation_id: reconciliationId,
    attempt_id: attemptId,
    source_chain_id: sourceChain.chainId,
    source_transaction_hash: sourceTransactionHash,
    source_block_number: sourceBlockNumber,
    source_block_hash: canonicalHash(sourceProof.sourceBlockHash),
    cctp_source_domain: cctpSourceDomain,
    cctp_message_nonce: nonce,
    cctp_message_hash: canonicalHash(sourceProof.messageHash),
    destination_chain_id: destinationChain.chainId,
    destination_transaction_hash: destinationTransactionHash,
    destination_block_number: destinationBlockNumber,
    destination_block_hash: canonicalHash(destinationTransaction.blockHash),
    token_address: tokenAddress,
    merchant_recipient: merchantRecipient,
    amount_base_units: amount,
    token_decimals: 6,
    verifier_policy_version: isDirect ? 2 : VERIFIER_POLICY_VERSION,
  };
  return {
    invoiceArgs: { invoice_id: invoiceId, terms },
    attemptArgs: { attempt_id: attemptId, invoice_id: invoiceId, source_chain_id: sourceChain.chainId },
    attestationArgs: { input: { ...digestInput, evidence_digest: nearEvidenceDigest(invoiceId, digestInput) } },
  };
}
