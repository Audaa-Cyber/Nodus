import test from "node:test";
import assert from "node:assert/strict";
import { executeCircleBridgeAfterFreshReservation } from "../src/lib/payments/circle-execution-reservation.ts";

const reservedResponse = {
  success: true,
  attempt: {
    status: "PROCESSING",
    circle_execution_reserved_at: "2026-11-10T12:00:00.000Z",
  },
};

test("a repeated start response cannot authorize a second bridge call", async () => {
  let bridgeCalls = 0;
  const bridge = async () => { bridgeCalls += 1; return "sent"; };
  assert.equal(await executeCircleBridgeAfterFreshReservation(true, reservedResponse, bridge), "sent");
  await assert.rejects(() => executeCircleBridgeAfterFreshReservation(true, {
    success: false,
    error: "circle_execution_already_reserved",
  }, bridge));
  assert.equal(bridgeCalls, 1);
  await assert.rejects(() => executeCircleBridgeAfterFreshReservation(false, reservedResponse, bridge));
  await assert.rejects(() => executeCircleBridgeAfterFreshReservation(true, {
    success: true,
    attempt: { status: "PROCESSING", circle_execution_reserved_at: null },
  }, bridge));
  assert.equal(bridgeCalls, 1);
});

test("browser status recovery is not an execution reservation", async () => {
  const resumedAttempt = {
    attempt: {
      status: "PROCESSING",
      circle_execution_reserved_at: "2026-11-10T12:00:00.000Z",
    },
    pending: true,
    sourceTransactionReferenceMissing: true,
  };
  await assert.rejects(() => executeCircleBridgeAfterFreshReservation(true, resumedAttempt, async () => {
    assert.fail("resumed status must not invoke the bridge");
  }));
});
