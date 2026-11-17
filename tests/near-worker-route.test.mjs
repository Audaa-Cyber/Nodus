import test, { mock, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

let rows, databaseError, viewError, workerError, calls;
const originalSecret = process.env.NEAR_OUTBOX_WORKER_SECRET;
after(() => {
  if (originalSecret === undefined) delete process.env.NEAR_OUTBOX_WORKER_SECRET;
  else process.env.NEAR_OUTBOX_WORKER_SECRET = originalSecret;
});
mock.module(new URL("../src/lib/server/near-settlement-outbox.ts", import.meta.url).href, {
  namedExports: { processNearSettlementOutbox: async (limit) => {
    calls.push(["drain", limit]);
    if (workerError) throw workerError;
    return { claimed: 1, submitted: 1, retry: 0, blocked: 0 };
  } },
});
mock.module(new URL("../src/lib/server/near-settlement-client.ts", import.meta.url).href, {
  namedExports: { createNearSettlementClient: () => {
    calls.push(["client"]);
    return { view: async (method, args) => {
      calls.push(["view", method, args]);
      if (viewError) throw viewError;
      return null;
    } };
  } },
});
mock.module(new URL("../src/lib/supabase/admin.ts", import.meta.url).href, {
  namedExports: { getSupabaseAdminClient: () => ({ from: () => ({ select: () => ({
    eq: () => ({ order: () => ({ limit: async () => {
      calls.push(["read"]);
      return { data: rows, error: databaseError };
    } }) }),
  }) }) }) },
});
mock.module(new URL("../node_modules/next/server.js", import.meta.url).href, {
  namedExports: { NextResponse: { json: (body, init) => Response.json(body, init) } },
});
const { GET, POST } = await import("../src/app/api/internal/near-settlement-outbox/route.ts");
const request = (secret = "worker-secret") => new Request("https://localhost/api/internal/near-settlement-outbox", {
  headers: { authorization: `Bearer ${secret}` },
});
beforeEach(() => {
  rows = []; databaseError = viewError = workerError = null; calls = [];
  process.env.NEAR_OUTBOX_WORKER_SECRET = "worker-secret";
});

test("unauthorized readiness and dispatch perform no work", async () => {
  for (const handler of [GET, POST]) {
    assert.equal((await handler(request("wrong"))).status, 401);
    assert.equal((await handler(request("x"))).status, 401);
  }
  assert.deepEqual(calls, []);
});

test("empty queues still check NEAR readiness and fail safely when RPC is unavailable", async () => {
  viewError = new Error("private RPC URL and signer details");
  const response = await GET(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ready: false, stage: "near_readback", error: "near_worker_readiness_failed",
  });
  assert.equal(calls.filter(([call]) => call === "view").length, 1);
  assert.equal(calls.some(([call]) => call === "drain"), false);
});

test("readiness checks a pending settlement without claiming or signing", async () => {
  rows = [{ reconciliation_id: "reconciliation-1", status: "pending", attempt_count: 2 }];
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ready: true, pendingJob: rows[0], recordPresent: false });
  assert.ok(calls.some(([call, method, args]) => call === "view"
    && method === "get_settlement" && args.reconciliation_id === "reconciliation-1"));
  assert.equal(calls.some(([call]) => call === "drain"), false);
});

test("database failure returns a safe error before creating an RPC client", async () => {
  databaseError = { message: "private database details" };
  const response = await GET(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ready: false, stage: "outbox_read", error: "near_outbox_read_failed" });
  assert.deepEqual(calls, [["read"]]);
});

test("authenticated dispatch drains the queue and hides worker errors", async () => {
  assert.equal((await POST(request())).status, 200);
  assert.deepEqual(calls, [["drain", 10]]);
  workerError = new Error("private signer details");
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "near_outbox_unavailable" });
});
