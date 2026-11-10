export function assertFreshCircleExecutionReservation(
  responseOk: boolean,
  payload: unknown,
): asserts payload is {
  success: true;
  attempt: { status: "PROCESSING"; circle_execution_reserved_at: string };
} {
  if (!responseOk || !payload || typeof payload !== "object") {
    throw new Error("circle_execution_not_reserved");
  }

  const result = payload as {
    success?: unknown;
    attempt?: { status?: unknown; circle_execution_reserved_at?: unknown };
  };
  const reservedAt = result.attempt?.circle_execution_reserved_at;
  if (result.success !== true || result.attempt?.status !== "PROCESSING"
    || typeof reservedAt !== "string" || !Number.isFinite(Date.parse(reservedAt))) {
    throw new Error("circle_execution_not_reserved");
  }
}

export async function executeCircleBridgeAfterFreshReservation<T>(
  responseOk: boolean,
  payload: unknown,
  bridge: () => Promise<T>,
): Promise<T> {
  assertFreshCircleExecutionReservation(responseOk, payload);
  return bridge();
}
