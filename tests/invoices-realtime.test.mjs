import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relPath) => readFile(new URL(relPath, import.meta.url), "utf8");

test("Migration: 20261115160000_realtime_invoices.sql is minimal, additive, and omits unnecessary REPLICA IDENTITY FULL", async () => {
  const sql = await read("../supabase/migrations/20261115160000_realtime_invoices.sql");

  // Checks publication existence safely
  assert.match(sql, /pubname = 'supabase_realtime'/i);

  // Adds invoices to publication
  assert.match(sql, /alter publication supabase_realtime add table public\.invoices;/i);

  // Does not force REPLICA IDENTITY FULL (not needed for payload.new updates and avoids WAL bloat)
  assert.doesNotMatch(sql, /replica identity full/i);

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

test("Realtime Payload Independence: UI relies strictly on payload.new.status and never depends on payload.old", async () => {
  const provider = await read("../src/components/invoice-realtime-provider.tsx");
  const detailSync = await read("../src/components/invoice-detail-live-sync.tsx");
  const table = await read("../src/components/invoices-table.tsx");

  // Provider reads payload.new and never reads payload.old
  assert.ok(provider.includes("const updated = payload.new as InvoiceRealtimeUpdate;"));
  assert.doesNotMatch(provider, /payload.old/);

  // Detail sync uses updated.status (from payload.new) and compares against React prop currentStatus
  assert.ok(detailSync.includes("if (updated.id === invoiceId && updated.status !== currentStatus)"));
  assert.doesNotMatch(detailSync, /payload.old/);

  // Table updates local state using updated.status from payload.new
  assert.ok(table.includes("applyInvoiceUpdate(prev, updated)"));
  assert.doesNotMatch(table, /payload.old/);
});

test("RLS Authorization: Authenticated business owner has SELECT permissions on public.invoices", async () => {
  const businessMigration = await read("../supabase/migrations/20261106191512_business_management.sql");

  // RLS SELECT policy on invoices verifies business ownership via auth.uid()
  assert.match(
    businessMigration,
    /create policy "Owners can view their invoices" on public\.invoices\s+for select to authenticated using\s*\(\s*exists \(select 1 from public\.business_profiles bp where bp\.id = business_id and bp\.owner_user_id = \(select auth\.uid\(\)\)\)\s*\);/i
  );

  // Authenticated role has SELECT grant on invoices
  assert.match(
    businessMigration,
    /grant select, insert, update on public\.invoices to authenticated;/i
  );
});

test("Authoritative Data: UI triggers router.refresh() to fetch verified server data on invoice events", async () => {
  const provider = await read("../src/components/invoice-realtime-provider.tsx");
  const detailSync = await read("../src/components/invoice-detail-live-sync.tsx");

  // Provider debounces router.refresh() on any invoice event
  assert.ok(provider.includes("router.refresh()"));

  // Detail sync triggers router.refresh() immediately when an invoice becomes paid
  assert.ok(detailSync.includes("router.refresh()"));
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
  assert.ok(source.includes("liveUpdatesRef.current.set(updated.id, updated)"));
  assert.ok(source.includes("applyInvoiceUpdate(prev, updated)"));

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
  assert.ok(layout.includes("<InvoiceRealtimeProvider businessId={business?.id} userId={user.id}>"));
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
