import "server-only";

import type { CircleChainInfo } from "@/lib/server/circle";

const CIRCLE_TESTNET_IRIS_URL = "https://iris-api-sandbox.circle.com";
const QUOTE_VALIDATION_ABI = "depositForBurnWithHookAndFees(uint256,uint32,bytes32,address,bytes32,bytes,(bytes,address))";
const ZERO_ADDRESS_BYTES32 = `0x${"0".repeat(64)}`;
const QUOTE_SAFETY_WINDOW_SECONDS = 30;

async function postCircleJson(url: string, body: Record<string, unknown>): Promise<{ status: number; payload: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let payload: unknown = null;
    if (response.ok) {
      try { payload = await response.json(); } catch { /* validated below */ }
    }
    return { status: response.status, payload };
  } catch {
    throw new CircleQuoteValidationError("unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

export class CircleQuoteValidationError extends Error {
  readonly code: "invalid" | "unavailable";
  readonly reason?: string;

  constructor(code: "invalid" | "unavailable", reason?: string) {
    super(`circle_quote_${code}`);
    this.code = code;
    this.reason = reason;
  }
}

export type CircleQuoteValidationInput = {
  source: CircleChainInfo;
  destination: CircleChainInfo;
  payer: string;
  recipient: string;
  amountBaseUnits: string;
  quote: string;
  feeTotal: string;
  feeItems: Array<{ type: string; amount: string }>;
  expiresAt: string;
  expiryMode: "TIMESTAMP" | "BLOCK_NUMBER";
  expiresAtBlock?: number;
};

type CircleQuoteExpiry =
  | { mode: "TIMESTAMP"; expiresAt: number }
  | { mode: "BLOCK_NUMBER"; expiresAtBlock: number; blockEstimatedAt: number };

export type CircleReceiveExactQuote = {
  quote: string;
  amountReceived: string;
  feeTotal: string;
  totalDebit: string;
  feeItems: Array<{ type: string; amount: string }>;
  expiresAt: string;
  expiryMode: CircleQuoteExpiry["mode"];
  expiresAtBlock?: number;
};

export function circleFeeQuoteRequest(input: {
  source: CircleChainInfo;
  destination: CircleChainInfo;
  amountBaseUnits: string;
}) {
  if (!/^[1-9][0-9]*$/.test(input.amountBaseUnits)) {
    throw new CircleQuoteValidationError("invalid");
  }
  const hookData = `0x${Buffer.concat([Buffer.from("cctp-forward", "utf8"), Buffer.alloc(20)]).toString("hex")}`;
  return {
    url: `${CIRCLE_TESTNET_IRIS_URL}/v2/quote/burn/usdc/${input.source.cctpDomainId}/${input.destination.cctpDomainId}`,
    body: {
      amount: input.amountBaseUnits,
      feeToken: input.source.usdcAddress,
      requests: [
        { type: "FORWARD", params: { hookData, destinationCaller: "0x0000000000000000000000000000000000000000" } },
        { type: "PRE_FINALITY" },
      ],
    },
  };
}

function unitsToUsdc(value: bigint): string {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export async function fetchCircleReceiveExactQuote(input: {
  source: CircleChainInfo;
  destination: CircleChainInfo;
  amountBaseUnits: string;
}): Promise<CircleReceiveExactQuote> {
  const { url, body } = circleFeeQuoteRequest(input);
  const response = await postCircleJson(url, body);
  if (response.status < 200 || response.status >= 300) {
    throw new CircleQuoteValidationError(response.status >= 500 || response.status === 429 ? "unavailable" : "invalid");
  }

  let result: Record<string, unknown>;
  try {
    const parsed = response.payload;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_response");
    result = parsed as Record<string, unknown>;
  } catch {
    throw new CircleQuoteValidationError("unavailable");
  }

  const feeTotal = typeof result.feeTotalAmount === "string" && /^[0-9]+$/.test(result.feeTotalAmount)
    ? BigInt(result.feeTotalAmount) : null;
  const items = Array.isArray(result.items) ? result.items : null;
  const expiry = result.expiry as Record<string, unknown> | undefined;
  let expiresAtSeconds: number | null = null;
  let expiryMode: CircleQuoteExpiry["mode"] | null = null;
  let expiresAtBlock: number | undefined;
  if (expiry?.mode === "TIMESTAMP" && typeof expiry.expiresAt === "number" && Number.isInteger(expiry.expiresAt)) {
    expiryMode = "TIMESTAMP";
    expiresAtSeconds = expiry.expiresAt;
  } else if (expiry?.mode === "BLOCK_NUMBER"
    && typeof expiry.expiresAtBlock === "number" && Number.isInteger(expiry.expiresAtBlock)
    && typeof expiry.blockEstimatedAt === "number" && Number.isInteger(expiry.blockEstimatedAt)) {
    expiryMode = "BLOCK_NUMBER";
    expiresAtSeconds = expiry.blockEstimatedAt;
    expiresAtBlock = expiry.expiresAtBlock;
  }
  if (typeof result.signedQuote !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(result.signedQuote)
    || typeof result.feeToken !== "string" || result.feeToken.toLowerCase() !== input.source.usdcAddress.toLowerCase()
    || feeTotal === null || !items || expiresAtSeconds === null || expiryMode === null
    || expiresAtSeconds * 1000 <= Date.now() + QUOTE_SAFETY_WINDOW_SECONDS * 1000) {
    throw new CircleQuoteValidationError("invalid");
  }

  let itemTotal = 0n;
  const feeItems: CircleReceiveExactQuote["feeItems"] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") throw new CircleQuoteValidationError("invalid");
    const value = item as Record<string, unknown>;
    if (typeof value.type !== "string" || !value.type || typeof value.amount !== "string" || !/^[0-9]+$/.test(value.amount)) {
      throw new CircleQuoteValidationError("invalid");
    }
    const amount = BigInt(value.amount);
    itemTotal += amount;
    feeItems.push({ type: value.type, amount: unitsToUsdc(amount) });
  }
  if (itemTotal !== feeTotal) throw new CircleQuoteValidationError("invalid");

  const amountReceived = BigInt(input.amountBaseUnits);
  return {
    quote: result.signedQuote,
    amountReceived: unitsToUsdc(amountReceived),
    feeTotal: unitsToUsdc(feeTotal),
    totalDebit: unitsToUsdc(amountReceived + feeTotal),
    feeItems,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    expiryMode,
    ...(expiresAtBlock !== undefined ? { expiresAtBlock } : {}),
  };
}

export function circleQuoteValidationRequest(input: CircleQuoteValidationInput) {
  const addressPattern = /^0x[0-9a-fA-F]{40}$/;
  if (!addressPattern.test(input.payer) || !addressPattern.test(input.recipient)
    || !/^[1-9][0-9]*$/.test(input.amountBaseUnits)
    || !/^0x(?:[0-9a-fA-F]{2})+$/.test(input.quote)) {
    throw new CircleQuoteValidationError("invalid");
  }

  // Circle App Kit binds receive-exact fee quotes to this fixed CCTP forwarder
  // hook, the merchant recipient, and the source payer as refund address.
  const hookData = `0x${Buffer.concat([Buffer.from("cctp-forward", "utf8"), Buffer.alloc(20)]).toString("hex")}`;
  const padAddress = (address: string) => `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
  return {
    url: `${CIRCLE_TESTNET_IRIS_URL}/v2/quote/validate/usdc/${input.source.cctpDomainId}`,
    body: {
      abiSignature: QUOTE_VALIDATION_ABI,
      args: [
        input.amountBaseUnits,
        String(input.destination.cctpDomainId),
        padAddress(input.recipient),
        input.source.usdcAddress,
        ZERO_ADDRESS_BYTES32,
        hookData,
        [input.quote, input.payer],
      ],
    },
  };
}

export function circleUsdcToBaseUnits(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d+(\.\d{1,6})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))).toString();
}

function feeItemsMatch(
  clientItems: CircleQuoteValidationInput["feeItems"],
  validatedItems: unknown,
): boolean {
  if (!Array.isArray(validatedItems) || validatedItems.length !== clientItems.length) return false;
  const validated = new Map<string, number>();
  for (const item of validatedItems) {
    if (!item || typeof item !== "object") return false;
    const value = item as Record<string, unknown>;
    if (typeof value.type !== "string" || value.argsMatch !== true
      || typeof value.amount !== "string" || !/^[0-9]+$/.test(value.amount)) return false;
    const key = `${value.type}:${value.amount}`;
    validated.set(key, (validated.get(key) ?? 0) + 1);
  }
  for (const item of clientItems) {
    const amount = circleUsdcToBaseUnits(item.amount);
    if (amount === null) return false;
    const key = `${item.type}:${amount}`;
    const count = validated.get(key) ?? 0;
    if (count === 0) return false;
    validated.set(key, count - 1);
  }
  return [...validated.values()].every((count) => count === 0);
}

export async function validateCircleSignedQuote(input: CircleQuoteValidationInput): Promise<void> {
  const { url, body } = circleQuoteValidationRequest(input);
  const response = await postCircleJson(url, body);
  if (response.status < 200 || response.status >= 300) {
    throw new CircleQuoteValidationError(response.status >= 500 || response.status === 429 ? "unavailable" : "invalid");
  }

  let result: Record<string, unknown>;
  try {
    const parsed = response.payload;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_response");
    result = parsed as Record<string, unknown>;
  } catch {
    throw new CircleQuoteValidationError("unavailable");
  }

  const expiry = result.expiry as Record<string, unknown> | undefined;
  const expectedExpiry = Date.parse(input.expiresAt);
  if (result.claimable !== true) throw new CircleQuoteValidationError("invalid", "circle_quote_not_claimable");
  if (!Array.isArray(result.failedChecks) || result.failedChecks.length !== 0) {
    throw new CircleQuoteValidationError("invalid", "circle_quote_failed_checks");
  }
  if (typeof result.signedQuote !== "string" || result.signedQuote.toLowerCase() !== input.quote.toLowerCase()) {
    throw new CircleQuoteValidationError("invalid", "circle_signed_quote_mismatch");
  }
  if (typeof result.feeToken !== "string" || result.feeToken.toLowerCase() !== input.source.usdcAddress.toLowerCase()) {
    throw new CircleQuoteValidationError("invalid", "circle_fee_token_mismatch");
  }
  if (result.feeTotalAmount !== circleUsdcToBaseUnits(input.feeTotal)) {
    throw new CircleQuoteValidationError("invalid", "circle_fee_total_mismatch");
  }
  if (!expiry || expiry.expired !== false) throw new CircleQuoteValidationError("invalid", "circle_quote_expired");
  if (input.expiryMode === "TIMESTAMP") {
    if (expiry.mode !== "TIMESTAMP") throw new CircleQuoteValidationError("invalid", "circle_quote_expiry_mode_mismatch");
    if (typeof expiry.expiresAt !== "number" || !Number.isInteger(expiry.expiresAt)
      || !Number.isFinite(expectedExpiry) || expectedExpiry !== expiry.expiresAt * 1000) {
      throw new CircleQuoteValidationError("invalid", "circle_quote_expiry_timestamp_mismatch");
    }
  } else {
    if (expiry.mode !== "BLOCK_NUMBER") throw new CircleQuoteValidationError("invalid", "circle_quote_expiry_mode_mismatch");
    if (typeof expiry.expiresAtBlock !== "number" || !Number.isInteger(expiry.expiresAtBlock)
      || expiry.expiresAtBlock !== input.expiresAtBlock) {
      throw new CircleQuoteValidationError("invalid", "circle_quote_expiry_block_mismatch");
    }
  }
  if (typeof expiry.secondsRemaining !== "number" || expiry.secondsRemaining <= QUOTE_SAFETY_WINDOW_SECONDS) {
    throw new CircleQuoteValidationError("invalid", "circle_quote_too_close_to_expiry");
  }
  if (!feeItemsMatch(input.feeItems, result.items)) {
    throw new CircleQuoteValidationError("invalid", "circle_fee_items_mismatch");
  }
}
