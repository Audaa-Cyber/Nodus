import test from "node:test";
import assert from "node:assert/strict";
import { deliverNearInvoiceRegistration } from "../src/lib/payments/near-invoice-registration.ts";

const job = { id: "outbox-1", invoice_id: "invoice-1", lock_token: "lock-1" };
const args = {
  invoice_id: "invoice-1",
  terms: {
    currency: "USD", amount_minor: "1200", destination_chain_id: 84532,
    token_decimals: 6, token_address: `0x${"a".repeat(40)}`, merchant_recipient: `0x${"b".repeat(40)}`,
  },
};
const record = { invoice_id: args.invoice_id, terms: { ...args.terms } };

test("verifies registry readback before marking an invoice registered", async () => {
  const calls = [];
  const result = await deliverNearInvoiceRegistration(job, args, null, {
    getInvoice: async () => { calls.push("read"); return calls.length === 1 ? null : record; },
    registerInvoice: async () => { calls.push("submit"); return "near-tx"; },
    markSubmitted: async () => calls.push("submitted"),
    markRegistered: async (_job, tx, reference) => calls.push(`registered:${tx}:${reference}`),
    retry: async () => calls.push("retry"),
    fail: async () => calls.push("failed"),
  });
  assert.equal(result, "registered");
  assert.deepEqual(calls, ["read", "submit", "submitted", "read", "registered:near-tx:invoice-1"]);
});

test("retry after an uncertain submission reads the existing invoice and avoids duplicates", async () => {
  const calls = [];
  const result = await deliverNearInvoiceRegistration(job, args, "near-tx", {
    getInvoice: async () => { calls.push("read"); return record; },
    registerInvoice: async () => { calls.push("duplicate-submit"); return "unexpected"; },
    markSubmitted: async () => calls.push("submitted"),
    markRegistered: async (_job, tx) => calls.push(`registered:${tx}`),
    retry: async () => calls.push("retry"),
    fail: async () => calls.push("failed"),
  });
  assert.equal(result, "registered");
  assert.deepEqual(calls, ["read", "registered:near-tx"]);
});

test("a mismatched existing invoice is failed instead of overwritten", async () => {
  const calls = [];
  const result = await deliverNearInvoiceRegistration(job, args, null, {
    getInvoice: async () => ({ ...record, terms: { ...record.terms, amount_minor: "1" } }),
    registerInvoice: async () => { calls.push("submit"); return "tx"; },
    markSubmitted: async () => {},
    markRegistered: async () => calls.push("registered"),
    retry: async () => calls.push("retry"),
    fail: async (_job, code) => calls.push(code),
  });
  assert.equal(result, "failed");
  assert.deepEqual(calls, ["near_invoice_registry_mismatch"]);
});
