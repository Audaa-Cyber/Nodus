import "server-only";

import {
  OneClickService,
  OpenAPI,
  type QuoteRequest,
} from "@defuse-protocol/one-click-sdk-typescript";

const API_BASE = "https://1click.chaindefuser.com";
const REQUEST_TIMEOUT_MS = 12_000;
const rateWindows = new Map<string, { startedAt: number; count: number }>();

export function allowOneClickRequest(key: string, maximum: number, windowMs: number) {
  const now = Date.now();
  for (const [entryKey, value] of rateWindows) if (now - value.startedAt > windowMs * 2) rateWindows.delete(entryKey);
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= maximum) return false;
  current.count += 1;
  return true;
}

function configureOneClick() {
  const jwt = process.env.ONE_CLICK_JWT?.trim();
  if (!jwt) throw new Error("one_click_credentials_missing");
  OpenAPI.BASE = API_BASE;
  OpenAPI.TOKEN = jwt;
}

function withTimeout<T>(task: PromiseLike<T>): Promise<T> {
  return Promise.race([
    Promise.resolve(task),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("one_click_timeout")), REQUEST_TIMEOUT_MS)),
  ]);
}

export function assertLivePaymentsEnabled() {
  const verifiedAssetIds = (process.env.LIVE_VERIFIED_USDC_ASSET_IDS ?? "")
    .split(",").map((assetId) => assetId.trim()).filter(Boolean);
  if (process.env.PAYMENT_MODE !== "live" || process.env.LIVE_PAYMENT_ENABLED !== "true" || verifiedAssetIds.length === 0) {
    throw new Error("live_payments_disabled");
  }
  if (!process.env.ONE_CLICK_JWT?.trim()) throw new Error("one_click_credentials_missing");
  return new Set(verifiedAssetIds);
}

export async function getOneClickTokens() {
  OpenAPI.BASE = API_BASE;
  OpenAPI.TOKEN = process.env.ONE_CLICK_JWT?.trim() || undefined;
  return withTimeout(OneClickService.getTokens());
}

export async function requestOneClickQuote(request: QuoteRequest) {
  configureOneClick();
  return withTimeout(OneClickService.getQuote(request));
}

export async function getOneClickExecutionStatus(depositAddress: string, depositMemo?: string) {
  configureOneClick();
  return withTimeout(OneClickService.getExecutionStatus(depositAddress, depositMemo));
}

export async function submitOneClickDepositTx(depositAddress: string, txHash: string) {
  configureOneClick();
  return withTimeout(OneClickService.submitDepositTx({ depositAddress, txHash }));
}
