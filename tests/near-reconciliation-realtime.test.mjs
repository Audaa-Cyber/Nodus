import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("NEAR realtime projection exposes minimal status under business-owner RLS only", async () => {
  const sql = await read("../supabase/migrations/20261117000000_near_reconciliation_realtime_projection.sql");

  assert.match(sql, /create table if not exists public\.near_reconciliation_status/i);
  assert.match(sql, /grant select on public\.near_reconciliation_status to authenticated/i);
  assert.match(sql, /bp\.owner_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /revoke all on public\.near_reconciliation_status from public, anon/i);
  assert.doesNotMatch(sql, /grant .*near_settlement_outbox.*authenticated/i);
  assert.doesNotMatch(sql, /\b(evidence|source_transaction_hash|destination_tx_hashes|lock_token)\s+(jsonb|text|uuid)/i);
  assert.match(sql, /case when new\.status = 'submitted' then new\.near_transaction_hash else null end/i);
  assert.match(sql, /alter publication supabase_realtime add table public\.near_reconciliation_status/i);
});

test("dashboard shares one business channel for invoice and NEAR status events", async () => {
  const source = await read("../src/components/invoice-realtime-provider.tsx");

  assert.match(source, /table: "invoices",\s+filter: `business_id=eq\.\$\{businessId\}`/);
  assert.match(source, /table: "near_reconciliation_status",\s+filter: `business_id=eq\.\$\{businessId\}`/);
  assert.match(source, /session\.user\.id === userId/);
  assert.match(source, /parseNearReconciliationUpdate\(payload\.new, businessId\)/);
});
