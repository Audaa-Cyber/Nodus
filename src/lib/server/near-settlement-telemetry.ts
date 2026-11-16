import "server-only";

export type NearSettlementEntryPoint = "payment_status" | "scheduled_worker";

export type NearSettlementLogContext = {
  entryPoint: NearSettlementEntryPoint;
  correlationId: string;
  jobId?: string;
};

/** Emits an allowlisted, structured timing event. Never pass RPC payloads or raw errors. */
export function logNearSettlementTiming(
  context: NearSettlementLogContext,
  stage: string,
  durationMs: number,
  result: "ok" | "error",
): void {
  console.info(JSON.stringify({
    event: "near_settlement_timing",
    ...context,
    stage,
    durationMs: Math.max(0, Math.round(durationMs)),
    result,
  }));
}

export async function measureNearSettlementStage<T>(
  context: NearSettlementLogContext,
  stage: string,
  operation: () => PromiseLike<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await operation();
    logNearSettlementTiming(context, stage, performance.now() - startedAt, "ok");
    return result;
  } catch (error) {
    logNearSettlementTiming(context, stage, performance.now() - startedAt, "error");
    throw error;
  }
}
