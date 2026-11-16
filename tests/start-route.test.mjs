import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const token = "a".repeat(43);
const attemptId = "123e4567-e89b-42d3-a456-426614174000";
const payer = "0xAbCdEf0123456789aBCDef0123456789aBCDef01";
const reservationTime = "2026-11-10T12:00:00.000Z";
let configured = true;
let rpcResult = {
  data: [{
    id: attemptId,
    status: "PROCESSING",
    circle_execution_reserved_at: reservationTime,
    quote_snapshot: { quote: "private-circle-quote" },
    circle_message_hash: "private-message-hash",
    settlement_evidence: { secret: "private-settlement-evidence" },
  }],
  error: null,
};
let rpcCalls = [];

mock.module(new URL("../src/lib/supabase/admin.ts", import.meta.url).href, {
  namedExports: {
    getSupabaseAdminClient: () => ({
      rpc: async (...args) => {
        rpcCalls.push(args);
        return rpcResult;
      },
    }),
  },
});
mock.module(new URL("../src/config/env.server.ts", import.meta.url).href, {
  namedExports: { isServerSupabaseConfigured: () => configured },
});
mock.module(new URL("../node_modules/next/server.js", import.meta.url).href, {
  namedExports: {
    NextResponse: {
      json: (body, init = {}) => new Response(JSON.stringify(body), {
        ...init,
        headers: { "Content-Type": "application/json", ...init.headers },
      }),
    },
  },
});

const { POST } = await import("../src/app/api/pay/[token]/attempt/[id]/start/route.ts");

function makeRequest(body = { expectedPayer: payer }) {
  return new Request("http://localhost/api/pay/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function context(tokenValue = token, idValue = attemptId) {
  return { params: Promise.resolve({ token: tokenValue, id: idValue }) };
}

async function invoke({ token: tokenValue = token, id = attemptId, body } = {}) {
  return POST(makeRequest(body), context(tokenValue, id));
}

function reset() {
  configured = true;
  rpcResult = {
    data: [{ id: attemptId, status: "PROCESSING", circle_execution_reserved_at: reservationTime }],
    error: null,
  };
  rpcCalls = [];
}

test("POST returns a confirmed reservation, normalized RPC arguments, and a safe no-store body", async () => {
  reset();
  rpcResult.data[0] = {
    ...rpcResult.data[0],
    quote_snapshot: { quote: "private-circle-quote" },
    circle_message_hash: "private-message-hash",
    settlement_evidence: { secret: "private-settlement-evidence" },
  };
  const response = await invoke();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const payload = await response.json();
  assert.deepEqual(payload, {
    success: true,
    attempt: { id: attemptId, status: "PROCESSING", circle_execution_reserved_at: reservationTime },
  });
  assert.equal(JSON.stringify(payload).includes("private-circle-quote"), false);
  assert.equal(JSON.stringify(payload).includes("private-message-hash"), false);
  assert.equal(JSON.stringify(payload).includes("private-settlement-evidence"), false);
  assert.equal(rpcCalls.length, 1);
  assert.deepEqual(rpcCalls[0], ["mark_circle_execution_started", {
    p_token_hash: createHash("sha256").update(token).digest("hex"),
    p_attempt_id: attemptId,
    p_expected_payer: payer.toLowerCase(),
  }]);
});

test("POST rejects malformed tokens and attempt IDs before RPC", async () => {
  reset();
  for (const input of [{ token: "bad" }, { id: "not-a-uuid" }]) {
    const response = await invoke(input);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: "attempt_unavailable" });
  }
  assert.equal(rpcCalls.length, 0);
});

test("POST handles missing server configuration without calling RPC", async () => {
  reset();
  configured = false;
  const response = await invoke();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "server_not_configured" });
  assert.equal(rpcCalls.length, 0);
});

test("POST rejects RPC errors and empty RPC results without leaking database details", async () => {
  reset();
  rpcResult = { data: null, error: { message: "private SQL error" } };
  let response = await invoke();
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "execution_start_failed" });
  rpcResult = { data: [], error: null };
  response = await invoke();
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "execution_start_failed" });
});

test("POST only succeeds for PROCESSING with a valid reservation timestamp", async () => {
  reset();
  const invalidRows = [
    { status: "PENDING_DEPOSIT", circle_execution_reserved_at: reservationTime },
    { status: "PROCESSING", circle_execution_reserved_at: null },
    { status: "PROCESSING", circle_execution_reserved_at: "not-a-timestamp" },
    { status: "PROCESSING", circle_execution_reserved_at: "2026-11-10" },
    { status: "PROCESSING", circle_execution_reserved_at: "   " },
  ];
  for (const row of invalidRows) {
    rpcResult = { data: [row], error: null };
    const response = await invoke();
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: "execution_reservation_not_confirmed" });
  }
});
