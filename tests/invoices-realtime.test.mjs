import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relPath) => readFile(new URL(relPath, import.meta.url), "utf8");

test("Migration: 20261115160000_realtime_invoices.sql is additive and enables Realtime for invoices", async () => {
  const sql = await read("../supabase/migrations/20261115160000_realtime_invoices.sql");

  // Enables REPLICA IDENTITY FULL for filtered updates
  assert.match(sql, /alter table public\.invoices replica identity full;/i);

  // Checks publication existence safely
  assert.match(sql, /pubname = 'supabase_realtime'/i);

  // Adds invoices to publication
  assert.match(sql, /alter publication supabase_realtime add table public\.invoices;/i);

  // Does not alter or drop existing tables or columns
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /drop column/i);
});

test("Realtime Provider: InvoiceRealtimeProvider authenticates socket and scopes to business_id", async () => {
  const source = await read("../src/components/invoice-realtime-provider.tsx");

  // Injects active JWT session token before subscribing
  assert.ok(source.includes("supabase.auth.getSession()"));
  assert.ok(source.includes("supabase.realtime.setAuth(session.access_token)"));

  // Scopes topic and filter strictly to business_id
  assert.ok(source.includes("topic = `business-invoices:${businessId}`"));
  assert.ok(source.includes('table: "invoices"'));
  assert.ok(source.includes("filter: `business_id=eq.${businessId}`"));

  // Cleans up existing duplicate channels with same topic
  assert.ok(source.includes("c.topic === `realtime:${topic}`"));
  assert.ok(source.includes("supabase.removeChannel(existing)"));

  // Cleanup on unmount
  assert.ok(source.includes("supabase.removeChannel(channel);"));
});

test("Realtime Lifecycle: Handles token refreshes and closes initial-fetch race", async () => {
  const source = await read("../src/components/invoice-realtime-provider.tsx");

  // Listens for auth state changes
  assert.ok(source.includes("supabase.auth.onAuthStateChange"));
  assert.ok(source.includes('event === "TOKEN_REFRESHED" || event === "SIGNED_IN"'));
  assert.ok(source.includes("authListener.unsubscribe()"));

  // Closes initial-fetch / subscription race on SUBSCRIBED
  assert.ok(source.includes('subStatus === "SUBSCRIBED"'));

  // Disconnect/timeout re-synchronization
  assert.ok(source.includes('subStatus === "CHANNEL_ERROR" || subStatus === "TIMED_OUT"'));
});

test("Invoices Table: InvoicesTable updates invoice status immediately upon Realtime UPDATE", async () => {
  const source = await read("../src/components/invoices-table.tsx");

  // Subscribes to live invoice updates
  assert.ok(source.includes("useInvoiceRealtime()"));
  assert.ok(source.includes("subscribeToInvoices((updated) => {"));

  // Updates row in local state immediately
  assert.ok(source.includes("inv.id === updated.id"));
  assert.ok(source.includes("(updated.status as InvoiceStatus) || inv.status"));

  // Preserves full table layout, classes, and pagination
  assert.ok(source.includes("status status-${status}"));
  assert.ok(source.includes("formatMoney(invoice.amount_minor, invoice.currency)"));
  assert.ok(source.includes("Page {page} of {totalPages}"));
});

test("Invoice Detail: InvoiceDetailLiveSync detects payment and triggers instant refresh to PaidInvoiceDetailView", async () => {
  const source = await read("../src/components/invoice-detail-live-sync.tsx");

  // Subscribes to live invoice updates
  assert.ok(source.includes("useInvoiceRealtime()"));
  assert.ok(source.includes("updated.id === invoiceId && updated.status !== currentStatus"));

  // Triggers router.refresh() on status change
  assert.ok(source.includes("router.refresh()"));

  // Displays transition banner when status transitions to paid
  assert.ok(source.includes('transitioningStatus === "paid"'));
  assert.ok(source.includes("Payment verified! Updating invoice receipt"));
});

test("Dashboard Layout: Integrates InvoiceRealtimeProvider across the executive shell", async () => {
  const layout = await read("../src/app/dashboard/layout.tsx");

  // Imports InvoiceRealtimeProvider
  assert.ok(layout.includes('import { InvoiceRealtimeProvider } from "@/components/invoice-realtime-provider";'));

  // Resolves business and wraps dashboard content
  assert.ok(layout.includes("const { business } = await getBusinessContext();"));
  assert.ok(layout.includes("<InvoiceRealtimeProvider businessId={business?.id}>"));
});

test("Invoice Detail Page: Embeds InvoiceDetailLiveSync in unpaid invoice view", async () => {
  const page = await read("../src/app/dashboard/invoices/[id]/page.tsx");

  assert.ok(page.includes('import { InvoiceDetailLiveSync } from "@/components/invoice-detail-live-sync";'));
  assert.ok(page.includes("<InvoiceDetailLiveSync invoiceId={invoice.id} currentStatus={invoice.status} />"));
});

test("Invoices Page: InvoicesPage renders InvoicesTable client component with server data", async () => {
  const page = await read("../src/app/dashboard/invoices/page.tsx");

  assert.ok(page.includes('import { InvoicesTable'));
  assert.ok(page.includes("<InvoicesTable"));
  assert.ok(page.includes("initialInvoices={"));
});
