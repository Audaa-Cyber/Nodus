import type { BridgeResult, BridgeStep } from "@circle-fin/app-kit";

export type CircleBridgeStepProgress = {
  name: string;
  state: BridgeStep["state"];
  txHash?: string;
  errorCategory?: string;
  forwarded?: boolean;
  batched?: boolean;
};

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const STEP_NAME = /^[A-Za-z][A-Za-z0-9 _-]{0,79}$/;

/** Keep durable SDK progress small and exclude raw errors/data that may contain wallet details. */
export function sanitizeCircleBridgeStep(value: unknown): CircleBridgeStepProgress | null {
  if (!value || typeof value !== "object") return null;
  const step = value as Record<string, unknown>;
  const name = typeof step.name === "string" ? step.name.trim() : "";
  const state = step.state;
  if (!STEP_NAME.test(name) || !["pending", "success", "error", "noop"].includes(String(state))) return null;
  const txHash = typeof step.txHash === "string" ? step.txHash : undefined;
  if (txHash !== undefined && !TX_HASH.test(txHash)) return null;
  const errorCategory = typeof step.errorCategory === "string" && /^[a-z_]{1,40}$/.test(step.errorCategory)
    ? step.errorCategory : undefined;
  return {
    name,
    state: state as BridgeStep["state"],
    ...(txHash ? { txHash } : {}),
    ...(errorCategory ? { errorCategory } : {}),
    ...(typeof step.forwarded === "boolean" ? { forwarded: step.forwarded } : {}),
    ...(typeof step.batched === "boolean" ? { batched: step.batched } : {}),
  };
}

export function canRetryCircleBridgeResult(
  result: BridgeResult,
  sourceBurnHashRecorded: boolean,
  isRetryableError: (error: unknown) => boolean,
): boolean {
  if (result.state !== "error" || sourceBurnHashRecorded) return false;
  const burnSubmitted = result.steps.some((step) =>
    /burn|depositforburn/i.test(step.name) && Boolean(step.txHash));
  if (burnSubmitted) return false;
  const failedStep = [...result.steps].reverse().find((step) => step.state === "error");
  return Boolean(failedStep?.error && isRetryableError(failedStep.error));
}
