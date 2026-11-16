import test from "node:test";
import assert from "node:assert/strict";
import {
  applyNotificationChange,
  mergeNotificationSnapshot,
} from "../src/lib/realtime/notification-state.ts";
import {
  applyInvoiceUpdate,
  mergeInvoiceSnapshot,
} from "../src/lib/realtime/invoice-state.ts";
import { parseNearReconciliationUpdate } from "../src/lib/realtime/near-reconciliation-state.ts";

const notification = (id, read_at = null) => ({
  id,
  recipient_user_id: "user-a",
  business_id: "business-a",
  type: "invoice_paid",
  title: "Invoice paid",
  message: "Verified payment received",
  invoice_id: `invoice-${id}`,
  destination_url: `/dashboard/invoices/${id}`,
  created_at: `2026-11-16T00:00:0${id.slice(-1)}Z`,
  read_at,
});

test("notification insert received during initial fetch merges by ID and preserves authoritative unread count", () => {
  const snapshot = [notification("n1")];
  const liveEvents = [
    { eventType: "INSERT", item: notification("n1") },
    { eventType: "INSERT", item: notification("n2") },
  ];

  const merged = mergeNotificationSnapshot(snapshot, 4, liveEvents);

  assert.equal(merged.unreadCount, 4);
  assert.deepEqual(merged.items.map((item) => item.id), ["n2", "n1"]);
});

test("notification update decrements unread count only on an unread-to-read transition", () => {
  const state = { items: [notification("n1")], unreadCount: 1 };
  const readEvent = { eventType: "UPDATE", item: notification("n1", "2026-11-16T00:01:00Z") };

  const once = applyNotificationChange(state, readEvent);
  const twice = applyNotificationChange(once, readEvent);

  assert.equal(once.unreadCount, 0);
  assert.equal(twice.unreadCount, 0);
  assert.equal(twice.items[0].read_at, "2026-11-16T00:01:00Z");
});

test("invoice realtime update is retained when stale server props arrive", () => {
  const rows = [
    { id: "invoice-a", status: "open", amount_minor: 5000 },
    { id: "invoice-b", status: "open", amount_minor: 7000 },
  ];
  const paidUpdate = { id: "invoice-a", status: "paid", amount_minor: 5000 };

  const updated = applyInvoiceUpdate(rows, paidUpdate);
  const afterStaleProps = mergeInvoiceSnapshot(rows, new Map([["invoice-a", paidUpdate]]));

  assert.equal(updated[0].status, "paid");
  assert.equal(afterStaleProps[0].status, "paid");
  assert.equal(afterStaleProps[1].status, "open");
});

test("NEAR reconciliation events require the active business and hide hashes before readback", () => {
  const pending = parseNearReconciliationUpdate({
    business_id: "business-a",
    invoice_id: "invoice-a",
    reconciliation_id: "reconciliation-a",
    status: "processing",
    near_transaction_hash: "must-not-be-exposed",
  }, "business-a");
  const verified = parseNearReconciliationUpdate({
    business_id: "business-a",
    invoice_id: "invoice-a",
    reconciliation_id: "reconciliation-a",
    status: "submitted",
    near_transaction_hash: "near-tx",
  }, "business-a");
  const otherBusiness = parseNearReconciliationUpdate({
    business_id: "business-b",
    invoice_id: "invoice-a",
    reconciliation_id: "reconciliation-a",
    status: "submitted",
    near_transaction_hash: "near-tx",
  }, "business-a");

  assert.equal(pending?.near_transaction_hash, null);
  assert.equal(verified?.near_transaction_hash, "near-tx");
  assert.equal(otherBusiness, null);
});
