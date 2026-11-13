import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const token = "a".repeat(43);
const attemptId = "123e4567-e89b-42d3-a456-426614174000";
let configured = true;
let rpcResult = { data: [{ transaction_hash: "0x" + "b".repeat(64) }], error: null };
let rpcCalls = [];

mock.module(new URL("../src/lib/supabase/admin.ts", import.meta.url).href, {
  namedExports: {
    getSupabaseAdminClient: () => ({ rpc: async (...args) => { rpcCalls.push(args); return rpcResult; } }),
  },
});
mock.module(new URL("../src/config/env.server.ts", import.meta.url).href, {
  namedExports: { isServerSupabaseConfigured: () => configured },
});
mock.module(new URL("../node_modules/next/server.js", import.meta.url).href, {
  namedExports: {
    NextResponse: {
      json: (body, init = {}) => new Response(JSON.stringify(body), {
        ...init, headers: { "Content-Type": "application/json", ...init.headers },
      }),
    },
  },
});

const { POST } = await import("../src/app/api/pay/[token]/attempt/[id]/progress/route.ts");

function invoke(body, tokenValue = token, id = attemptId) {
  return POST(new Request("http://localhost/api/pay/progress", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ token: tokenValue, id }) });
}

function reset() { configured = true; rpcResult = { data: [{ transaction_hash: "0x" + "b".repeat(64) }], error: null }; rpcCalls = []; }

test("POST durably records sanitized SDK steps against the reserved shared attempt", async () => {
  reset();
  const txHash = `0x${"c".repeat(64)}`;
  const response = await invoke({
    resultState: "pending",
    step: { name: "burn", state: "success", txHash, error: { message: "wallet detail" }, data: { secret: true } },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { success: true, sourceBurnRecorded: true });
  assert.deepEqual(rpcCalls, [["record_circle_sdk_progress", {
    p_token_hash: createHash("sha256").update(token).digest("hex"),
    p_attempt_id: attemptId,
    p_result_state: "pending",
    p_step: { name: "burn", state: "success", txHash },
  }]]);
});

test("POST rejects malformed or unsanitizable progress without RPC writes", async () => {
  reset();
  const response = await invoke({ resultState: "success", step: { name: "burn", state: "success", txHash: "approval-hash" } });
  assert.equal(response.status, 400);
  assert.deepEqual(rpcCalls, []);
});

test("POST handles missing server configuration without RPC writes", async () => {
  reset();
  configured = false;
  const response = await invoke({ resultState: "error" });
  assert.equal(response.status, 503);
  assert.deepEqual(rpcCalls, []);
});
