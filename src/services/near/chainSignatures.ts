/**
 * @file chainSignatures.ts
 * @description Production-grade NEAR Chain Signatures (MPC) orchestration module.
 * Enables NEAR accounts to programmatically derive EVM addresses, sign native
 * transactions across EVM chains (Ethereum, Base, Arbitrum, Optimism, Polygon, etc.)
 * via decentralized Multi-Party Computation (MPC), and broadcast raw transactions.
 */

import { Account } from "@near-js/accounts";
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { base58, hex } from "@scure/base";
import {
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionSerializable,
  type TransactionSerializableEIP1559,
  type TransactionSerializableLegacy,
  type TransactionSerializableEIP2930,
  bytesToHex,
  getAddress,
  hexToBytes,
  keccak256,
  serializeTransaction,
} from "viem";

// ============================================================================
// CONSTANTS & TARGET CONTRACT DEFINITIONS
// ============================================================================

/**
 * Standard NEAR MPC Threshold Cryptography Contract Addresses.
 * - Mainnet: 'v1.signer-prod.near' (canonical: 'v1.signer')
 * - Testnet: 'v1.signer-testnet.near' (canonical: 'v1.signer-prod.testnet')
 */
export const NEAR_MPC_CONTRACT_IDS = {
  mainnet: "v1.signer-prod.near",
  mainnetAlias: "v1.signer",
  testnet: "v1.signer-testnet.near",
  testnetAlias: "v1.signer-prod.testnet",
} as const;

export type NearMpcNetwork = "mainnet" | "testnet";

/**
 * Pinned uncompressed Root Public Keys for the NEAR MPC network cluster.
 * secp256k1 domain_id = 0.
 */
export const NEAR_MPC_ROOT_PUBLIC_KEYS = {
  /**
   * Mainnet MPC Root Key (Base58 encoded point):
   * secp256k1:3tFRbMqmoa6AAALMrEFAYCEoHcqKxeW38YptwowBVBtXK1vo36HDbUWuR6EZmoK4JcH6HDkNMGGqP1ouV7VZUWya
   */
  mainnet:
    "secp256k1:3tFRbMqmoa6AAALMrEFAYCEoHcqKxeW38YptwowBVBtXK1vo36HDbUWuR6EZmoK4JcH6HDkNMGGqP1ouV7VZUWya",

  /**
   * Testnet MPC Root Key (Base58 encoded point):
   * secp256k1:4NfTiv3UsGahebgTaHyD9vF8KYKMBnfd6kh94mK6xv8fGBiJB8TBtFMP5WWXz6B89Ac1fbpzPwAvoyQebemHFwx3
   */
  testnet:
    "secp256k1:4NfTiv3UsGahebgTaHyD9vF8KYKMBnfd6kh94mK6xv8fGBiJB8TBtFMP5WWXz6B89Ac1fbpzPwAvoyQebemHFwx3",
} as const;

/**
 * Gas budget required by NEAR MPC threshold signing nodes:
 * Exactly 300 Teragas (300 * 10^12 gas units).
 */
export const ATTACHED_GAS_300_TGAS: bigint = 300_000_000_000_000n;

/**
 * Default minimal deposit for MPC signature requests (1 yoctoNEAR).
 */
export const DEFAULT_ATTACHED_DEPOSIT: bigint = 1n;

/**
 * Default protocol prefix for epsilon additive key derivation in NEAR MPC v0.1.0.
 */
export const DEFAULT_EPSILON_DERIVATION_PREFIX =
  "near-mpc-recovery v0.1.0 epsilon derivation:";

/**
 * Default delimiter separating NEAR account ID and path.
 */
export const DEFAULT_DERIVATION_SEPARATOR = ",";

/**
 * Secp256k1 Curve Order (n) and half-order (n/2) for EIP-2 low-s canonicalization.
 */
const SECP256K1_N = secp256k1.CURVE.n;
const SECP256K1_HALF_N = SECP256K1_N >> 1n;

// ============================================================================
// ERROR HIERARCHY
// ============================================================================

export class NearMpcError extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
    this.name = "NearMpcError";
  }
}

export class NearExecutionError extends NearMpcError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "NearExecutionError";
  }
}

export class EvmOrchestrationError extends NearMpcError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "EvmOrchestrationError";
  }
}

export class MpcSignaturePackingError extends NearMpcError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "MpcSignaturePackingError";
  }
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type Secp256k1Point = InstanceType<typeof secp256k1.ProjectivePoint>;

/**
 * Raw response signature structure returned by the NEAR MPC contract `sign` method.
 */
export interface RawMpcSignatureResponse {
  big_r?:
    | {
        affine_point: string;
      }
    | string;
  s?:
    | {
        scalar: string;
      }
    | string;
  recovery_id?: number;
  recoveryId?: number;
}

/**
 * Formatted EVM signature parameters ready for transaction serialization.
 */
export interface PackedEvmSignature {
  /** 32-byte hex string (0x...) */
  r: Hex;
  /** 32-byte hex string (0x...) */
  s: Hex;
  /** Standard EVM recovery identifier (EIP-155 or 27/28) */
  v: bigint;
  /** 1-bit recovery parity (0 or 1) for EIP-1559 and EIP-2930 envelopes */
  yParity: 0 | 1;
  /** Normalized recovery ID (0 or 1) */
  recoveryId: number;
}

/**
 * Unsigned EVM transaction configuration payload.
 */
export type UnsignedEvmTransactionConfig =
  | (Omit<TransactionSerializableEIP1559, "type"> & { type?: "eip1559" })
  | (Omit<TransactionSerializableLegacy, "type"> & { type?: "legacy" })
  | (Omit<TransactionSerializableEIP2930, "type"> & { type?: "eip2930" });

/**
 * Options for EVM address derivation.
 */
export interface DeriveEvmAddressOptions {
  /** Custom delimiter between accountId and path (defaults to ",") */
  separator?: string;
  /** Custom derivation prefix (defaults to "near-mpc-recovery v0.1.0 epsilon derivation:") */
  prefix?: string;
  /** Use raw concatenation without the protocol prefix if explicitly set to false */
  useProtocolPrefix?: boolean;
  /** Custom root public key in Base58 ("secp256k1:..."), hex string, or Uint8Array */
  rootPublicKey?: string | Uint8Array;
  /** Target network cluster to select the default root public key ('mainnet' | 'testnet') */
  network?: NearMpcNetwork;
}

/**
 * Execution options for transaction orchestration.
 */
export interface OrchestrationOptions {
  /** Target MPC contract ID (defaults to 'v1.signer-prod.near' or 'v1.signer-testnet.near') */
  mpcContractId?: string;
  /** Key version for derivation in MPC (defaults to 0) */
  keyVersion?: number;
  /** Attached deposit in yoctoNEAR (defaults to 1n) */
  attachedDeposit?: bigint | string;
  /** Attached gas in gas units (defaults to exactly 300 Teragas: 300,000,000,000,000) */
  attachedGas?: bigint;
  /**
   * Reverse the transaction hash byte array before passing to the NEAR contract.
   * Cait-Sith MPC protocol interprets scalar field elements in little-endian byte order.
   * Defaults to true.
   */
  reversePayload?: boolean;
  /** Network environment ('mainnet' | 'testnet'). Defaults to 'mainnet' */
  network?: NearMpcNetwork;
  /** Derivation options for generating the sender address */
  derivationOptions?: DeriveEvmAddressOptions;
  /** Network timeout in milliseconds for NEAR and EVM RPC operations (defaults to 90000ms) */
  timeoutMs?: number;
}

/**
 * Result of a successfully orchestrated and broadcasted EVM transaction.
 */
export interface OrchestrationResult {
  /** The broadcasted EVM transaction hash */
  transactionHash: Hash;
  /** Complete RLP-serialized raw signed transaction (0x...) */
  rawTransaction: Hex;
  /** Deterministically derived EVM sender address */
  senderAddress: Address;
  /** Packed signature components */
  signature: PackedEvmSignature;
  /** Nonce committed to the transaction */
  nonce: number;
  /** Destination EVM chain ID */
  chainId: number;
  /** Complete final execution outcome from the NEAR contract call */
  nearTxOutcome: unknown;
}

// ============================================================================
// ROOT PUBLIC KEY PARSING & RECOVERY
// ============================================================================

/**
 * Parses a NEAR MPC root public key into a secp256k1 ProjectivePoint.
 * Supports:
 * - NEAR Base58 string format (e.g. "secp256k1:3tFRb...")
 * - 64-byte raw uncompressed public key (128 hex chars without 04 prefix)
 * - 65-byte uncompressed public key (130 hex chars with 04 prefix)
 * - 33-byte compressed public key (66 hex chars with 02/03 prefix)
 * - Raw Uint8Array buffer
 */
export function parseRootPublicKey(
  keyInput: string | Uint8Array,
): Secp256k1Point {
  try {
    if (keyInput instanceof Uint8Array) {
      if (keyInput.length === 64) {
        const prefixed = new Uint8Array(65);
        prefixed[0] = 0x04;
        prefixed.set(keyInput, 1);
        return secp256k1.ProjectivePoint.fromHex(prefixed);
      }
      return secp256k1.ProjectivePoint.fromHex(keyInput);
    }

    let cleaned = keyInput.trim();
    if (cleaned.startsWith("secp256k1:")) {
      cleaned = cleaned.replace("secp256k1:", "");
    }

    // Attempt Base58 decode (standard NEAR public key format)
    let decodedBytes: Uint8Array | null = null;
    try {
      decodedBytes = base58.decode(cleaned);
    } catch {
      // Not base58, may be hex
    }

    if (decodedBytes) {
      if (decodedBytes.length === 64) {
        const prefixed = new Uint8Array(65);
        prefixed[0] = 0x04;
        prefixed.set(decodedBytes, 1);
        return secp256k1.ProjectivePoint.fromHex(prefixed);
      }
      return secp256k1.ProjectivePoint.fromHex(decodedBytes);
    }

    // Fall back to hex string
    let hexStr = cleaned.startsWith("0x") ? cleaned.slice(2) : cleaned;
    if (hexStr.length === 128) {
      hexStr = "04" + hexStr;
    }
    return secp256k1.ProjectivePoint.fromHex(hexStr);
  } catch (error) {
    throw new NearMpcError(
      `Failed to parse NEAR MPC root public key: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}

// ============================================================================
// CORE COMPONENT 1: EVM ADDRESS DERIVATION FROM NEAR ACCOUNT
// ============================================================================

/**
 * Helper to compute derived secp256k1 public key point and raw 64-byte uncompressed buffer.
 */
export function deriveEvmPublicKey(
  nearAccountId: string,
  path: string,
  options?: DeriveEvmAddressOptions,
): {
  childPoint: Secp256k1Point;
  uncompressed64Bytes: Uint8Array;
  uncompressedHex: Hex;
} {
  const separator = options?.separator ?? DEFAULT_DERIVATION_SEPARATOR;
  const usePrefix = options?.useProtocolPrefix ?? true;
  const prefix = usePrefix
    ? (options?.prefix ?? DEFAULT_EPSILON_DERIVATION_PREFIX)
    : "";

  // 1. Concatenate nearAccountId, separating character string, and derivation path
  const derivationMessage = `${prefix}${nearAccountId}${separator}${path}`;

  // 2. Compute SHA-256 hash of this combined string payload
  const messageBytes = new TextEncoder().encode(derivationMessage);
  const hashBuffer = sha256(messageBytes);

  // 3. Feed resulting hash buffer into secp256k1 additive key derivation
  const network = options?.network ?? "mainnet";
  const rootKeySource =
    options?.rootPublicKey ?? NEAR_MPC_ROOT_PUBLIC_KEYS[network];
  const rootPoint = parseRootPublicKey(rootKeySource);

  // Read the 32-byte SHA-256 hash as a big-endian scalar tweak modulo curve order
  const scalarHex = hex.encode(hashBuffer);
  const tweakScalar = BigInt(`0x${scalarHex}`) % SECP256K1_N;
  if (tweakScalar === 0n) {
    throw new NearMpcError(
      "Derived scalar tweak evaluated to zero. Path collision or invalid derivation input.",
    );
  }

  // Tweak point T = tweakScalar * G
  const tweakPoint = secp256k1.ProjectivePoint.BASE.multiply(tweakScalar);

  // Child public key P_child = P_root + T
  const childPoint = rootPoint.add(tweakPoint);

  // 4. Generate the uncompressed 64-byte EVM public key (excluding the 0x04 prefix)
  const fullUncompressedBytes = childPoint.toRawBytes(false); // 65 bytes starting with 0x04
  const uncompressed64Bytes = fullUncompressedBytes.subarray(1); // 64 bytes (X || Y coordinates)
  const uncompressedHex: Hex = bytesToHex(uncompressed64Bytes);

  return {
    childPoint,
    uncompressed64Bytes,
    uncompressedHex,
  };
}

/**
 * Core Component 1: EVM Address Derivation from NEAR Account.
 * Deterministically derives a checksummed EVM address (0x...) for any NEAR account
 * and path using the NEAR MPC network cluster root key.
 *
 * Algorithm Requirements:
 * 1. Concatenate nearAccountId, separating string, and derivation path.
 * 2. Compute SHA-256 hash of this combined string payload.
 * 3. Feed resulting hash buffer into secp256k1 public key derivation algorithm.
 * 4. Generate uncompressed 64-byte EVM public key (excluding 0x04 prefix).
 * 5. Compute Keccak-256 hash of this public key slice.
 * 6. Extract the last 20 bytes of Keccak hash and format as standard checksummed EVM address.
 *
 * @param nearAccountId - NEAR account ID (e.g. "alice.near" or "bob.testnet")
 * @param path - Freeform derivation path (e.g. "ethereum-wallet-1")
 * @param options - Derivation configuration (custom root key, separator, network)
 * @returns Standard EIP-55 checksummed EVM address (0x...)
 */
export function deriveEvmAddress(
  nearAccountId: string,
  path: string,
  options?: DeriveEvmAddressOptions,
): Address {
  try {
    const { uncompressed64Bytes } = deriveEvmPublicKey(
      nearAccountId,
      path,
      options,
    );

    // 5. Compute Keccak-256 hash of the 64-byte public key slice
    const pubKeyHash = keccak256(uncompressed64Bytes);

    // 6. Extract last 20 bytes of Keccak hash (last 40 hex chars) and format into standard checksummed address
    const rawAddress = `0x${pubKeyHash.slice(-40)}` as Address;
    return getAddress(rawAddress);
  } catch (error) {
    if (error instanceof NearMpcError) {
      throw error;
    }
    throw new NearMpcError(
      `Failed to derive EVM address for '${nearAccountId}' on path '${path}': ${
        error instanceof Error ? error.message : String(error)
      }`,
      error,
    );
  }
}

// ============================================================================
// CORE COMPONENT 3: MPC SIGNATURE PACKING TO EVM R, S, V
// ============================================================================

/**
 * Normalizes and zero-pads a hex scalar value to an exact 32-byte length (64 hex characters).
 */
export function padHexTo32Bytes(
  input: string | bigint | Uint8Array,
  label: string,
): Hex {
  let hexString = "";

  if (typeof input === "bigint") {
    hexString = input.toString(16);
  } else if (input instanceof Uint8Array) {
    hexString = bytesToHex(input).slice(2);
  } else if (typeof input === "string") {
    hexString = input.trim();
    if (hexString.startsWith("0x") || hexString.startsWith("0X")) {
      hexString = hexString.slice(2);
    }
  } else {
    throw new MpcSignaturePackingError(
      `Invalid type provided for ${label}: ${typeof input}`,
    );
  }

  // If a 33-byte compressed affine point (66 hex characters with '02' or '03' prefix) is passed, extract X-coordinate
  if (
    hexString.length === 66 &&
    (hexString.startsWith("02") || hexString.startsWith("03"))
  ) {
    hexString = hexString.slice(2);
  }

  if (hexString.length > 64) {
    // If leading zeroes caused excessive length, strip leading zeros down to 64
    hexString = hexString.replace(/^0+/, "");
    if (hexString.length > 64) {
      throw new MpcSignaturePackingError(
        `${label} exceeds 32-byte capacity (${hexString.length / 2} bytes)`,
      );
    }
  }

  const padded = hexString.padStart(64, "0");
  return `0x${padded}` as Hex;
}

/**
 * Extracts and decodes the affine point and scalar components from NEAR MPC contract response.
 */
function extractRawSignatureComponents(contractOutput: unknown): {
  rawBigR: string;
  rawS: string;
  inferredRecoveryId: number | undefined;
} {
  let parsed: unknown = contractOutput;

  // If the contract return value is wrapped in a string or Buffer
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      // Keep as string if parsing fails
    }
  }

  // Extract from object representation
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;

    // Case 1: Standard NEAR MPC format { big_r: { affine_point: "..." }, s: { scalar: "..." }, recovery_id?: number }
    let rawBigR = "";
    if (
      obj.big_r &&
      typeof obj.big_r === "object" &&
      "affine_point" in obj.big_r
    ) {
      rawBigR = String(
        (obj.big_r as { affine_point: unknown }).affine_point ?? "",
      );
    } else if (typeof obj.big_r === "string") {
      rawBigR = obj.big_r;
    } else if (typeof obj.r === "string") {
      rawBigR = obj.r;
    }

    let rawS = "";
    if (obj.s && typeof obj.s === "object" && "scalar" in obj.s) {
      rawS = String((obj.s as { scalar: unknown }).scalar ?? "");
    } else if (typeof obj.s === "string") {
      rawS = obj.s;
    }

    let inferredRecoveryId: number | undefined = undefined;
    if (typeof obj.recovery_id === "number") {
      inferredRecoveryId = obj.recovery_id;
    } else if (typeof obj.recoveryId === "number") {
      inferredRecoveryId = obj.recoveryId;
    }

    if (rawBigR && rawS) {
      return { rawBigR, rawS, inferredRecoveryId };
    }

    // Case 2: Array-like tuple [big_r, s, recovery_id?]
    if (Array.isArray(parsed) && parsed.length >= 2) {
      const item0 = parsed[0];
      const item1 = parsed[1];
      const item2 = parsed[2];

      const bigR =
        typeof item0 === "object" && item0 && "affine_point" in item0
          ? String(item0.affine_point)
          : String(item0);
      const sVal =
        typeof item1 === "object" && item1 && "scalar" in item1
          ? String(item1.scalar)
          : String(item1);
      const rec = typeof item2 === "number" ? item2 : undefined;

      return { rawBigR: bigR, rawS: sVal, inferredRecoveryId: rec };
    }
  }

  throw new MpcSignaturePackingError(
    `Unable to extract signature components from contract response: ${JSON.stringify(
      contractOutput,
    )}`,
  );
}

/**
 * Core Component 3: MPC Signature Packing to EVM R, S, V.
 * Converts the NEAR MPC return payload (split affine coordinate object)
 * into standard EVM-compliant signature parameters.
 *
 * Mathematical Parsing Requirements:
 * 1. Extract scalar properties from contract signature payload.
 * 2. Pad both r and s with leading zeros to ensure exact 32-byte lengths (64 hex characters each).
 * 3. Enforce EIP-2 low-s canonical form (s <= n/2) to prevent transaction malleability.
 * 4. Determine standard EVM recovery parameter v:
 *    - For Legacy/EIP-155: v = recoveryId + 35 + (chainId * 2)
 *    - For EIP-1559/EIP-2930: yParity = 0 or 1, v = recoveryId (or standard 27/28 envelope)
 *
 * @param contractResponse - The raw output from the NEAR MPC `sign` contract invocation
 * @param txContext - Context containing transaction type and chain ID
 * @returns Fully formatted PackedEvmSignature object
 */
export function packMpcSignature(
  contractResponse: unknown,
  txContext: {
    type?: "eip1559" | "legacy" | "eip2930";
    chainId: number;
  },
): PackedEvmSignature {
  try {
    // 1. Extract scalar properties from contract signature payload
    const { rawBigR, rawS, inferredRecoveryId } =
      extractRawSignatureComponents(contractResponse);

    // Determine recovery ID from affine point prefix if not explicitly returned
    let recoveryId = inferredRecoveryId;
    let cleanBigR = rawBigR.trim();
    if (cleanBigR.startsWith("0x") || cleanBigR.startsWith("0X")) {
      cleanBigR = cleanBigR.slice(2);
    }

    if (recoveryId === undefined) {
      if (cleanBigR.startsWith("02")) {
        // Even Y coordinate
        recoveryId = 0;
      } else if (cleanBigR.startsWith("03")) {
        // Odd Y coordinate
        recoveryId = 1;
      } else {
        // Default to 0 if indeterminate
        recoveryId = 0;
      }
    }

    // 2. Pad both r and s strings with leading zeros to exact 32-byte lengths
    const rHex = padHexTo32Bytes(cleanBigR, "r");
    let sBigInt = BigInt(
      padHexTo32Bytes(rawS, "s"),
    );

    // EIP-2 Malleability check: Ensure s is in the lower half of the curve order
    let adjustedRecoveryId = recoveryId;
    if (sBigInt > SECP256K1_HALF_N) {
      sBigInt = SECP256K1_N - sBigInt;
      // Invert recovery bit when s is negated
      adjustedRecoveryId = adjustedRecoveryId ^ 1;
    }

    const sHex = padHexTo32Bytes(sBigInt, "s");
    const yParity: 0 | 1 = adjustedRecoveryId === 0 ? 0 : 1;

    // 3. Determine standard EVM recovery parameter v
    let v: bigint;
    const txType = txContext.type ?? "eip1559";

    if (txType === "legacy") {
      // EIP-155 replay protection formula: v = recoveryId + 35 + 2 * chainId
      v = BigInt(adjustedRecoveryId + 35 + txContext.chainId * 2);
    } else {
      // Modern EIP-1559 / EIP-2930: yParity is primary; v is 27/28 or recoveryId
      v = BigInt(adjustedRecoveryId + 27);
    }

    return {
      r: rHex,
      s: sHex,
      v,
      yParity,
      recoveryId: adjustedRecoveryId,
    };
  } catch (error) {
    if (error instanceof NearMpcError) {
      throw error;
    }
    throw new MpcSignaturePackingError(
      `Failed to pack MPC signature into EVM parameters: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error,
    );
  }
}

// ============================================================================
// CORE COMPONENT 2: THE TRANSACTION ORCHESTRATION PIPELINE
// ============================================================================

/**
 * Decodes the returned value from a NEAR FinalExecutionOutcome.
 */
function decodeNearExecutionOutcome(outcome: unknown): unknown {
  if (!outcome || typeof outcome !== "object") {
    return outcome;
  }

  const record = outcome as Record<string, unknown>;

  // Check for execution failure
  if (record.status && typeof record.status === "object") {
    const statusObj = record.status as Record<string, unknown>;
    if ("Failure" in statusObj) {
      throw new NearExecutionError(
        `NEAR MPC execution reverted: ${JSON.stringify(statusObj.Failure)}`,
        statusObj.Failure,
      );
    }

    if ("SuccessValue" in statusObj) {
      const base64Value = String(statusObj.SuccessValue);
      if (!base64Value) {
        return null;
      }
      try {
        const decodedUtf8 = Buffer.from(base64Value, "base64").toString("utf8");
        return JSON.parse(decodedUtf8);
      } catch {
        return Buffer.from(base64Value, "base64");
      }
    }
  }

  // If already decoded
  return outcome;
}

/**
 * Core Component 2: The Transaction Orchestration Pipeline.
 *
 * Orchestrates an end-to-end multi-chain transaction using NEAR Chain Signatures (MPC):
 * 1. Derives the sender's EVM address from the NEAR account and derivation path.
 * 2. Fetches the correct current nonce and network gas parameters dynamically using the viem PublicClient.
 * 3. Serializes and hashes the transaction payload using viem's `serializeTransaction` to extract
 *    the 32-byte unsigned transaction hash buffer.
 * 4. Reverses the hash array bytes (as required by the NEAR Cait-Sith MPC signer argument schema).
 * 5. Invokes `nearAccount.functionCall` targeting the MPC contract ID with exactly 300 Teragas
 *    (300,000,000,000,000 gas units) to cover heavy multi-party threshold calculation overhead.
 * 6. Decodes and packs the returned affine coordinates (r, s, v).
 * 7. Combines raw tx config with signature components via viem's `serializeTransaction`.
 * 8. Broadcasts the resulting raw transaction stream via `publicClient.sendRawTransaction`.
 *
 * @param nearAccount - Authenticated NEAR Account instance (from @near-js/accounts)
 * @param transactionConfig - Unsigned EVM transaction parameters
 * @param derivationPath - Derivation path string (e.g. "ethereum-wallet-1")
 * @param publicClient - Connected viem PublicClient instance
 * @param options - Optional orchestration overrides (contract ID, gas, deposit, timeouts)
 * @returns Complete OrchestrationResult including EVM tx hash and raw signed stream
 */
export async function orchestrateEvmTransaction(
  nearAccount: Account,
  transactionConfig: UnsignedEvmTransactionConfig,
  derivationPath: string,
  publicClient: PublicClient,
  options?: OrchestrationOptions,
): Promise<OrchestrationResult> {
  const network = options?.network ?? "mainnet";
  const mpcContractId =
    options?.mpcContractId ?? NEAR_MPC_CONTRACT_IDS[network];
  const keyVersion = options?.keyVersion ?? 0;
  const attachedGas = options?.attachedGas ?? ATTACHED_GAS_300_TGAS;
  const attachedDeposit = options?.attachedDeposit ?? DEFAULT_ATTACHED_DEPOSIT;
  const reversePayload = options?.reversePayload ?? true;
  const timeoutMs = options?.timeoutMs ?? 90000;

  try {
    // ------------------------------------------------------------------------
    // Step 1: Derive EVM Address from NEAR Account & Path
    // ------------------------------------------------------------------------
    const senderAddress = deriveEvmAddress(
      nearAccount.accountId,
      derivationPath,
      {
        network,
        ...options?.derivationOptions,
      },
    );

    // ------------------------------------------------------------------------
    // Step 2: Fetch Current Nonce, ChainId, & Gas Parameters Dynamically
    // ------------------------------------------------------------------------
    let chainId = transactionConfig.chainId;
    if (!chainId) {
      try {
        chainId = await Promise.race([
          publicClient.getChainId(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new EvmOrchestrationError(
                    `Timeout fetching chainId after ${timeoutMs}ms`,
                  ),
                ),
              timeoutMs,
            ),
          ),
        ]);
      } catch (err) {
        throw new EvmOrchestrationError(
          `Failed to fetch chainId from EVM RPC client: ${
            err instanceof Error ? err.message : String(err)
          }`,
          err,
        );
      }
    }

    let nonce = transactionConfig.nonce;
    if (nonce === undefined) {
      try {
        nonce = await Promise.race([
          publicClient.getTransactionCount({
            address: senderAddress,
            blockTag: "pending",
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new EvmOrchestrationError(
                    `Timeout fetching nonce for ${senderAddress} after ${timeoutMs}ms`,
                  ),
                ),
              timeoutMs,
            ),
          ),
        ]);
      } catch (err) {
        throw new EvmOrchestrationError(
          `Failed to fetch transaction nonce for derived address ${senderAddress}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          err,
        );
      }
    }

    const txType: "eip1559" | "legacy" | "eip2930" =
      transactionConfig.type ?? "eip1559";

    // Prepare complete transaction payload with resolved parameters
    let completeTx: TransactionSerializable;

    if (txType === "eip1559") {
      let maxFeePerGas = transactionConfig.maxFeePerGas;
      let maxPriorityFeePerGas = transactionConfig.maxPriorityFeePerGas;

      if (!maxFeePerGas || !maxPriorityFeePerGas) {
        try {
          const fees = await publicClient.estimateFeesPerGas();
          maxFeePerGas = maxFeePerGas ?? fees.maxFeePerGas;
          maxPriorityFeePerGas =
            maxPriorityFeePerGas ?? fees.maxPriorityFeePerGas;
        } catch {
          // Fallback to gasPrice if estimateFeesPerGas is unsupported
          const fallbackGasPrice = await publicClient.getGasPrice();
          maxFeePerGas = maxFeePerGas ?? fallbackGasPrice * 2n;
          maxPriorityFeePerGas =
            maxPriorityFeePerGas ?? (fallbackGasPrice > 1000000000n ? 1000000000n : fallbackGasPrice);
        }
      }

      let gas = transactionConfig.gas;
      if (!gas) {
        try {
          gas = await publicClient.estimateGas({
            account: senderAddress,
            to: transactionConfig.to ?? undefined,
            value: transactionConfig.value,
            data: transactionConfig.data,
          });
          // Add a 20% safety margin for complex contract execution
          gas = (gas * 120n) / 100n;
        } catch {
          // Standard native transfer gas fallback
          gas = 21000n;
        }
      }

      completeTx = {
        type: "eip1559",
        chainId,
        nonce,
        to: transactionConfig.to,
        value: transactionConfig.value ?? 0n,
        data: transactionConfig.data,
        gas,
        maxFeePerGas,
        maxPriorityFeePerGas,
      } as TransactionSerializableEIP1559;
    } else if (txType === "legacy") {
      let gasPrice = transactionConfig.gasPrice;
      if (!gasPrice) {
        gasPrice = await publicClient.getGasPrice();
      }

      let gas = transactionConfig.gas;
      if (!gas) {
        try {
          gas = await publicClient.estimateGas({
            account: senderAddress,
            to: transactionConfig.to ?? undefined,
            value: transactionConfig.value,
            data: transactionConfig.data,
          });
          gas = (gas * 120n) / 100n;
        } catch {
          gas = 21000n;
        }
      }

      completeTx = {
        type: "legacy",
        chainId,
        nonce,
        to: transactionConfig.to,
        value: transactionConfig.value ?? 0n,
        data: transactionConfig.data,
        gas,
        gasPrice,
      } as TransactionSerializableLegacy;
    } else {
      // EIP-2930 transaction
      const accessList =
        "accessList" in transactionConfig && transactionConfig.accessList
          ? transactionConfig.accessList
          : [];
      const gasPrice =
        "gasPrice" in transactionConfig && transactionConfig.gasPrice
          ? transactionConfig.gasPrice
          : await publicClient.getGasPrice();

      completeTx = {
        type: "eip2930",
        chainId,
        nonce,
        to: transactionConfig.to,
        value: transactionConfig.value ?? 0n,
        data: transactionConfig.data,
        gas: transactionConfig.gas ?? 21000n,
        gasPrice,
        accessList,
      } as TransactionSerializableEIP2930;
    }

    // ------------------------------------------------------------------------
    // Step 3: Serialize & Hash Transaction to Extract 32-byte Unsigned Hash
    // ------------------------------------------------------------------------
    const unsignedSerializedHex = serializeTransaction(completeTx);
    const unsignedTxHash = keccak256(unsignedSerializedHex);
    const unsignedTxHashBytes = hexToBytes(unsignedTxHash);

    if (unsignedTxHashBytes.length !== 32) {
      throw new EvmOrchestrationError(
        `Invalid transaction hash length: expected 32 bytes, received ${unsignedTxHashBytes.length}`,
      );
    }

    // ------------------------------------------------------------------------
    // Step 4: Reverse Payload Bytes (Cait-Sith Little-Endian Schema)
    // ------------------------------------------------------------------------
    const payloadBytes = reversePayload
      ? Array.from(unsignedTxHashBytes).reverse()
      : Array.from(unsignedTxHashBytes);

    // ------------------------------------------------------------------------
    // Step 5: Invoke NEAR MPC Contract (`nearAccount.functionCall`)
    // ------------------------------------------------------------------------
    const mpcArgs = {
      payload: payloadBytes,
      path: derivationPath,
      key_version: keyVersion,
    };

    let nearOutcome: unknown;
    try {
      nearOutcome = await Promise.race([
        nearAccount.functionCall({
          contractId: mpcContractId,
          methodName: "sign",
          args: mpcArgs,
          gas: attachedGas,
          attachedDeposit: BigInt(attachedDeposit),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new NearExecutionError(
                  `NEAR MPC sign call timed out after ${timeoutMs}ms targeting ${mpcContractId}`,
                ),
              ),
            timeoutMs,
          ),
        ),
      ]);
    } catch (contractErr) {
      throw new NearExecutionError(
        `Failed executing NEAR MPC 'sign' functionCall on ${mpcContractId}: ${
          contractErr instanceof Error ? contractErr.message : String(contractErr)
        }`,
        contractErr,
      );
    }

    // Decode base64 SuccessValue if present
    const decodedResult = decodeNearExecutionOutcome(nearOutcome);

    // ------------------------------------------------------------------------
    // Step 6: Pack MPC Affine Coordinates into EVM Signature (r, s, v)
    // ------------------------------------------------------------------------
    const packedSignature = packMpcSignature(decodedResult, {
      type: txType,
      chainId,
    });

    // ------------------------------------------------------------------------
    // Step 7: Serialize Signed Transaction Payload with Viem
    // ------------------------------------------------------------------------
    const rawSignedTransactionHex = serializeTransaction(completeTx, {
      r: packedSignature.r,
      s: packedSignature.s,
      v: packedSignature.v,
      yParity: packedSignature.yParity,
    });

    // ------------------------------------------------------------------------
    // Step 8: Broadcast Raw Transaction via PublicClient
    // ------------------------------------------------------------------------
    let txHash: Hash;
    try {
      txHash = await Promise.race([
        publicClient.sendRawTransaction({
          serializedTransaction: rawSignedTransactionHex,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new EvmOrchestrationError(
                  `Timeout broadcasting raw transaction after ${timeoutMs}ms`,
                ),
              ),
            timeoutMs,
          ),
        ),
      ]);
    } catch (broadcastErr) {
      throw new EvmOrchestrationError(
        `Failed to broadcast raw transaction to EVM chain (chainId: ${chainId}): ${
          broadcastErr instanceof Error ? broadcastErr.message : String(broadcastErr)
        }. Raw Tx: ${rawSignedTransactionHex}`,
        broadcastErr,
      );
    }

    return {
      transactionHash: txHash,
      rawTransaction: rawSignedTransactionHex,
      senderAddress,
      signature: packedSignature,
      nonce,
      chainId,
      nearTxOutcome: nearOutcome,
    };
  } catch (err) {
    if (err instanceof NearMpcError) {
      throw err;
    }
    throw new EvmOrchestrationError(
      `Unhandled error during EVM transaction orchestration: ${
        err instanceof Error ? err.message : String(err)
      }`,
      err,
    );
  }
}
