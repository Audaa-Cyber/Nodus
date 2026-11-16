import {
  type PublicClient,
  type Chain,
  createPublicClient,
  http,
  parseAbi,
} from "viem";
import { baseSepoliaChain } from "../wallet/networks.ts";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const CIRCLE_TESTNET_TOKEN_MESSENGER_WITH_FEES = "0x8745D906D67C346E5eb1aEEED38Eb87F34DF0C0A" as const;
export const BASE_SEPOLIA_TOKEN_MESSENGER_WITH_FEES = CIRCLE_TESTNET_TOKEN_MESSENGER_WITH_FEES;

/**
 * Standard gas unit benchmarks matching Circle CCTP V2 EVM forwarder path.
 * DEPOSIT_FOR_BURN_WITH_FEES_GAS_LIMIT: matches Circle SDK average benchmark for depositForBurnWithHookAndFees (626,584n).
 * APPROVE_GAS_LIMIT: conservative upper bound for ERC-20 approve on Base Sepolia (150,000n).
 */
export const DEPOSIT_FOR_BURN_WITH_FEES_GAS_LIMIT = 626_584n;
export const APPROVE_GAS_LIMIT = 150_000n;

export const DEFAULT_BASE_SEPOLIA_RPC = "https://sepolia.base.org";
export const DEFAULT_GAS_ESTIMATE_TIMEOUT_MS = 5000;

export const CIRCLE_GAS_ESTIMATE_UNAVAILABLE_MESSAGE =
  "Circle source-chain gas estimate is unavailable; payment is not eligible.";

export interface EstimateCircleSourceGasParams {
  payerAddress: `0x${string}` | string;
  amountBaseUnits: bigint;
  publicClient?: PublicClient;
  fallbackClient?: PublicClient;
  fallbackRpcUrl?: string;
  fallbackChain?: Chain;
  usdcAddress?: `0x${string}`;
  tokenMessengerWithFeesAddress?: `0x${string}`;
  timeoutMs?: number;
}

export interface CircleSourceGasEstimate {
  estimatedGasWei: bigint;
  gasPriceWei: bigint;
  gasUnits: bigint;
  allowance: bigint;
  allowanceSufficient: boolean;
  requiresApproval: boolean;
  rpcUsed: "primary" | "fallback";
}

const ERC20_ALLOWANCE_ABI = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
]);

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string = "Operation timed out",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchCircleAllowance(
  client: PublicClient,
  payerAddress: `0x${string}`,
  usdcAddress: `0x${string}` = BASE_SEPOLIA_USDC_ADDRESS,
  spenderAddress: `0x${string}` = BASE_SEPOLIA_TOKEN_MESSENGER_WITH_FEES,
): Promise<bigint> {
  const result = await client.readContract({
    address: usdcAddress,
    abi: ERC20_ALLOWANCE_ABI,
    functionName: "allowance",
    args: [payerAddress, spenderAddress],
  });
  if (typeof result !== "bigint") {
    throw new Error("Invalid allowance result");
  }
  return result;
}

export async function fetchCircleGasPriceWei(
  client: PublicClient,
): Promise<bigint> {
  let gasPrice: bigint | undefined;
  try {
    const fees = await client.estimateFeesPerGas();
    if (fees?.maxFeePerGas !== undefined && fees.maxFeePerGas > 0n) {
      gasPrice = fees.maxFeePerGas;
    }
  } catch {
    // If estimateFeesPerGas is unsupported or fails, fall back to getGasPrice
  }

  if (gasPrice === undefined || gasPrice <= 0n) {
    const standardPrice = await client.getGasPrice();
    if (standardPrice !== undefined && standardPrice > 0n) {
      gasPrice = standardPrice;
    }
  }

  if (gasPrice === undefined || gasPrice <= 0n) {
    throw new Error("Unable to determine positive gas price from client");
  }

  return gasPrice;
}

interface ClientQueryResult {
  allowance: bigint;
  gasPriceWei: bigint;
}

async function queryClient(
  client: PublicClient,
  payerAddress: `0x${string}`,
  timeoutMs: number,
  clientLabel: string,
  usdcAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
): Promise<ClientQueryResult> {
  return await withTimeout(
    (async () => {
      const [allowance, gasPriceWei] = await Promise.all([
        fetchCircleAllowance(client, payerAddress, usdcAddress, spenderAddress),
        fetchCircleGasPriceWei(client),
      ]);
      return { allowance, gasPriceWei };
    })(),
    timeoutMs,
    `Gas estimation timed out on ${clientLabel} after ${timeoutMs}ms`,
  );
}

/**
 * Estimates source-chain gas required for a Circle CCTP bridge transaction.
 *
 * Guarantees:
 * 1. Checks on-chain allowance of payer for TokenMessengerWithFees.
 * 2. If allowance is insufficient, includes APPROVE_GAS_LIMIT (150,000n) in addition to DEPOSIT_FOR_BURN (626,584n).
 * 3. Evaluates live network gas price / EIP-1559 fees with timeout guard.
 * 4. Falls back to canonical Base Sepolia RPC if primary client hangs or fails.
 * 5. Strict fail-closed: NEVER returns 0 or negative gas; always throws standard error on failure.
 */
export async function estimateCircleSourceGas(
  params: EstimateCircleSourceGasParams,
): Promise<CircleSourceGasEstimate> {
  const {
    payerAddress,
    amountBaseUnits,
    publicClient,
    fallbackClient,
    fallbackRpcUrl = DEFAULT_BASE_SEPOLIA_RPC,
    fallbackChain = baseSepoliaChain,
    usdcAddress = BASE_SEPOLIA_USDC_ADDRESS,
    tokenMessengerWithFeesAddress = BASE_SEPOLIA_TOKEN_MESSENGER_WITH_FEES,
    timeoutMs = DEFAULT_GAS_ESTIMATE_TIMEOUT_MS,
  } = params;

  // 1. Strict input validation
  if (!payerAddress || !/^0x[0-9a-fA-F]{40}$/.test(payerAddress)) {
    throw new Error(CIRCLE_GAS_ESTIMATE_UNAVAILABLE_MESSAGE, {
      cause: new Error(`Invalid payer address: ${payerAddress}`),
    });
  }
  if (amountBaseUnits <= 0n) {
    throw new Error(CIRCLE_GAS_ESTIMATE_UNAVAILABLE_MESSAGE, {
      cause: new Error(`Invalid payment amount: ${amountBaseUnits}`),
    });
  }

  const normalizedPayer = payerAddress as `0x${string}`;
  let queryResult: ClientQueryResult | null = null;
  let rpcUsed: "primary" | "fallback" = "primary";

  // 2. Try primary client if provided
  if (publicClient) {
    try {
      queryResult = await queryClient(publicClient, normalizedPayer, timeoutMs, "primary RPC", usdcAddress, tokenMessengerWithFeesAddress);
      rpcUsed = "primary";
    } catch {
      queryResult = null;
    }
  }

  // 3. Fallback to canonical RPC if primary failed or was not provided
  if (!queryResult) {
    try {
      const activeFallbackClient =
        fallbackClient ??
        createPublicClient({
          chain: fallbackChain,
          transport: http(fallbackRpcUrl, { timeout: timeoutMs, retryCount: 0 }),
        });
      queryResult = await queryClient(activeFallbackClient, normalizedPayer, timeoutMs, "fallback RPC", usdcAddress, tokenMessengerWithFeesAddress);
      rpcUsed = "fallback";
    } catch (fallbackError) {
      // Both failed or timed out: strict fail-closed
      throw new Error(CIRCLE_GAS_ESTIMATE_UNAVAILABLE_MESSAGE, {
        cause: fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)),
      });
    }
  }

  // 4. Calculate gas units and total estimated gas
  const { allowance, gasPriceWei } = queryResult;
  if (gasPriceWei <= 0n) {
    throw new Error(CIRCLE_GAS_ESTIMATE_UNAVAILABLE_MESSAGE, {
      cause: new Error(`Non-positive gas price returned: ${gasPriceWei}`),
    });
  }

  const allowanceSufficient = allowance >= amountBaseUnits;
  const requiresApproval = !allowanceSufficient;
  const gasUnits = requiresApproval
    ? APPROVE_GAS_LIMIT + DEPOSIT_FOR_BURN_WITH_FEES_GAS_LIMIT
    : DEPOSIT_FOR_BURN_WITH_FEES_GAS_LIMIT;

  const estimatedGasWei = gasUnits * gasPriceWei;

  if (estimatedGasWei <= 0n) {
    throw new Error(CIRCLE_GAS_ESTIMATE_UNAVAILABLE_MESSAGE, {
      cause: new Error(`Calculated non-positive estimated gas: ${estimatedGasWei}`),
    });
  }

  return {
    estimatedGasWei,
    gasPriceWei,
    gasUnits,
    allowance,
    allowanceSufficient,
    requiresApproval,
    rpcUsed,
  };
}
