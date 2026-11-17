import test from "node:test";
import assert from "node:assert/strict";
import { startNearLocalWorker } from "../src/lib/payments/near-local-worker.ts";

test("local recovery drains both existing queues and retries a failed dispatch", async () => {
  const timers = [], calls = [], reports = [];
  let fail = true;
  const stop = startNearLocalWorker({
    registerInvoices: async () => { calls.push("register"); if (fail) throw new Error("RPC unavailable"); },
    settlePayments: async () => { calls.push("settle"); },
    report: (queue, result) => reports.push([queue, result]),
    schedule: (callback, delay) => { timers.push({ callback, delay }); return () => {}; },
  });
  assert.equal(timers[0].delay, 0);
  timers.shift().callback();
  await new Promise(setImmediate);
  assert.deepEqual(calls, ["register", "settle"]);
  assert.deepEqual(reports[0], ["invoice_registration", "error"]);
  assert.equal(timers[0].delay, 30000);
  fail = false;
  timers.shift().callback();
  await new Promise(setImmediate);
  assert.deepEqual(calls, ["register", "settle", "register", "settle"]);
  stop();
  timers.shift().callback();
  await new Promise(setImmediate);
  assert.equal(calls.length, 4);
});

test("slow jobs never overlap and stopping during a job prevents more work", async () => {
  const timers = [], calls = [];
  let finish;
  const stop = startNearLocalWorker({
    registerInvoices: () => new Promise(resolve => { calls.push("register"); finish = resolve; }),
    settlePayments: async () => calls.push("settle"), report: () => {},
    schedule: callback => { timers.push(callback); return () => {}; },
  });
  timers.shift()();
  assert.equal(timers.length, 0);
  stop(); finish();
  await new Promise(setImmediate);
  assert.deepEqual(calls, ["register"]);
  assert.equal(timers.length, 0);
});
