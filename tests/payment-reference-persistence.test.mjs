import test from "node:test";
import assert from "node:assert/strict";
import { createPaymentReferenceWriter } from "../src/lib/payments/payment-reference-persistence.ts";

const attemptId = "123e4567-e89b-42d3-a456-426614174000";
const approvalTransactionHash = `0x${"a".repeat(64)}`;
const transactionHash = `0x${"b".repeat(64)}`;

function storageFixture() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function savedResponse(body, id = attemptId) {
  return Response.json({ success: true, attempt: {
    id,
    transaction_hash: body.transactionHash,
    circle_approval_tx_hash: body.approvalTransactionHash,
  } });
}

test("retries failed HTTP and offline saves and verifies the returned references", async () => {
  const storage = storageFixture();
  const requests = [];
  const delays = [];
  const writer = createPaymentReferenceWriter("token", {
    storage: () => storage,
    pause: async (ms) => { delays.push(ms); },
    fetcher: async (url, init) => {
      const body = JSON.parse(init.body);
      requests.push({ url, body });
      if (requests.length === 1) return Response.json({ error: "unavailable" }, { status: 503 });
      if (requests.length === 2) throw new TypeError("offline");
      return savedResponse(body);
    },
  });
  const pending = writer.persist(attemptId, { transactionHash, approvalTransactionHash });
  assert.equal(storage.values.size, 1, "backup is written before the first request");
  assert.equal(await pending, true);
  assert.equal(requests.length, 3);
  assert.deepEqual(delays, [250, 750]);
  assert.ok(requests.every((request) => request.url.endsWith(`/attempt/${attemptId}/submit`)));
  assert.deepEqual(requests[2].body, { transactionHash, approvalTransactionHash });
});

test("HTTP success without matching database references is not acknowledged", async () => {
  for (const response of [
    () => Response.json({ success: true }),
    () => savedResponse({ transactionHash: approvalTransactionHash }),
    () => savedResponse({ transactionHash }, "another-attempt"),
  ]) {
    const storage = storageFixture();
    const writer = createPaymentReferenceWriter("token", {
      storage: () => storage, pause: async () => {}, fetcher: async () => response(),
    });
    assert.equal(await writer.persist(attemptId, { transactionHash }), false);
    assert.equal(storage.values.size, 1, "failed saves retain their backup");
  }
});

test("reload recovers both hashes for the same attempt and retries without broadcasting", async () => {
  const storage = storageFixture();
  const offline = createPaymentReferenceWriter("token", {
    storage: () => storage, pause: async () => {}, fetcher: async () => { throw new Error("offline"); },
  });
  assert.equal(await offline.persist(attemptId, { approvalTransactionHash, transactionHash }), false);
  const requests = [];
  const reloaded = createPaymentReferenceWriter("token", {
    storage: () => storage,
    fetcher: async (url, init) => {
      requests.push(url);
      return savedResponse(JSON.parse(init.body));
    },
  });
  assert.deepEqual(reloaded.read(attemptId), { transactionHash, approvalTransactionHash });
  assert.equal(await reloaded.persist(attemptId), true);
  assert.deepEqual(requests, [`/api/pay/token/attempt/${attemptId}/submit`]);
  assert.deepEqual(reloaded.read("another-attempt"), {});
  assert.deepEqual(createPaymentReferenceWriter("another-token", { storage: () => storage }).read(attemptId), {});
  reloaded.clear(attemptId);
  assert.equal(storage.values.size, 0);
});

test("concurrent approval and burn events retain both references and serialize saves", async () => {
  const storage = storageFixture();
  let release;
  let started;
  const firstRequest = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  let active = 0;
  let maxActive = 0;
  const bodies = [];
  const writer = createPaymentReferenceWriter("token", {
    storage: () => storage,
    fetcher: async (_url, init) => {
      active++;
      maxActive = Math.max(maxActive, active);
      const body = JSON.parse(init.body);
      bodies.push(body);
      if (bodies.length === 1) { started(); await gate; }
      active--;
      return savedResponse(body);
    },
  });
  const approval = writer.persist(attemptId, { approvalTransactionHash });
  await firstRequest;
  const burn = writer.persist(attemptId, { transactionHash, approvalTransactionHash: null });
  assert.deepEqual(writer.read(attemptId), { approvalTransactionHash, transactionHash });
  release();
  assert.deepEqual(await Promise.all([approval, burn]), [true, true]);
  assert.equal(maxActive, 1);
  assert.deepEqual(bodies[1], { approvalTransactionHash, transactionHash });
});

test("conflicting references are preserved for review and never overwritten", async () => {
  let requests = 0;
  const writer = createPaymentReferenceWriter("token", {
    storage: () => storageFixture(),
    fetcher: async () => { requests++; return Response.json({ error: "conflict" }, { status: 409 }); },
  });
  assert.equal(await writer.persist(attemptId, { transactionHash }), false);
  assert.equal(requests, 1, "permanent HTTP errors do not trigger rapid retries");
  assert.equal(await writer.persist(attemptId, { transactionHash: approvalTransactionHash }), false);
  assert.equal(requests, 1);
  assert.equal(writer.read(attemptId).transactionHash, transactionHash);
});

test("unavailable browser storage does not interrupt an observed transaction", async () => {
  const writer = createPaymentReferenceWriter("token", {
    storage: () => { throw new Error("storage blocked"); },
    fetcher: async (_url, init) => savedResponse(JSON.parse(init.body)),
  });
  assert.equal(await writer.persist(attemptId, { transactionHash }), true);
  assert.equal(writer.read(attemptId).transactionHash, transactionHash);
});

test("malformed backups and invalid hashes are never submitted", async () => {
  const storage = storageFixture();
  storage.setItem(`nodus:live-references:token:${attemptId}`, "not json");
  const writer = createPaymentReferenceWriter("token", {
    storage: () => storage, fetcher: async () => { assert.fail("invalid references submitted"); },
  });
  assert.deepEqual(writer.read(attemptId), {});
  assert.equal(await writer.persist(attemptId), false);
  assert.equal(await writer.persist(attemptId, { transactionHash: "broken" }), false);
});
