import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL("../supabase/migrations/20261115100000_in_app_notifications.sql", import.meta.url);
const migrationSql = await readFile(migrationPath, "utf8");
const databaseTypes = await readFile(new URL("../src/types/database.ts", import.meta.url), "utf8");

test("Step 1 & 2: Migration creates persistent notifications table with required columns and foreign keys", () => {
  // Table creation
  assert.match(migrationSql, /create table public\.notifications/i);

  // Required columns
  assert.match(migrationSql, /id uuid primary key default gen_random_uuid\(\)/i);
  assert.match(migrationSql, /recipient_user_id uuid not null references auth\.users\(id\) on delete cascade/i);
  assert.match(migrationSql, /business_id uuid not null references public\.business_profiles\(id\) on delete cascade/i);
  assert.match(migrationSql, /type text not null/i);
  assert.match(migrationSql, /title text not null/i);
  assert.match(migrationSql, /message text not null/i);
  assert.match(migrationSql, /invoice_id uuid references public\.invoices\(id\) on delete cascade/i);
  assert.match(migrationSql, /destination_url text/i);
  assert.match(migrationSql, /created_at timestamptz not null default now\(\)/i);
  assert.match(migrationSql, /read_at timestamptz/i);
});

test("Step 2: Database-level uniqueness constraint prevents duplicate notifications for the same invoice-paid event", () => {
  assert.match(
    migrationSql,
    /constraint notifications_recipient_invoice_type_unique unique\s*\(\s*recipient_user_id,\s*invoice_id,\s*type\s*\)/i
  );
});

test("Step 2: Migration provides indexes for newest notifications, unread count, business, and invoice lookup", () => {
  // Newest notifications per user
  assert.match(
    migrationSql,
    /create index notifications_recipient_created_idx\s+on public\.notifications\s*\(\s*recipient_user_id,\s*created_at desc,\s*id desc\s*\)/i
  );

  // Unread notifications partial index
  assert.match(
    migrationSql,
    /create index notifications_recipient_unread_idx\s+on public\.notifications\s*\(\s*recipient_user_id,\s*created_at desc\s*\)\s+where read_at is null/i
  );

  // Business and invoice indexes
  assert.match(
    migrationSql,
    /create index notifications_business_created_idx\s+on public\.notifications\s*\(\s*business_id,\s*created_at desc\s*\)/i
  );
  assert.match(
    migrationSql,
    /create index notifications_invoice_id_idx\s+on public\.notifications\s*\(\s*invoice_id\s*\)/i
  );
});

test("Step 2: RLS protects notifications so business owners can only read and update their own notifications", () => {
  // RLS enabled
  assert.match(migrationSql, /alter table public\.notifications enable row level security/i);

  // SELECT policy scoped to recipient_user_id = auth.uid()
  assert.match(
    migrationSql,
    /create policy "Users can view their own notifications"\s+on public\.notifications\s+for select\s+to authenticated\s+using\s*\(\s*recipient_user_id\s*=\s*\(select auth\.uid\(\)\)\s*\)/i
  );

  // UPDATE policy scoped to recipient_user_id = auth.uid()
  assert.match(
    migrationSql,
    /create policy "Users can update their own notification read status"\s+on public\.notifications\s+for update\s+to authenticated\s+using\s*\(\s*recipient_user_id\s*=\s*\(select auth\.uid\(\)\)\s*\)\s+with check\s*\(\s*recipient_user_id\s*=\s*\(select auth\.uid\(\)\)\s*\)/i
  );

  // Direct table insert and delete revoked from ordinary clients
  assert.match(migrationSql, /revoke all on public\.notifications from public, anon, authenticated/i);
  assert.match(migrationSql, /grant select on public\.notifications to authenticated/i);
  assert.match(migrationSql, /grant update \(read_at\) on public\.notifications to authenticated/i);
  assert.doesNotMatch(migrationSql, /grant insert on public\.notifications to authenticated/i);
  assert.doesNotMatch(migrationSql, /grant delete on public\.notifications to authenticated/i);
});

test("Step 2: Defense-in-depth trigger guard restricts updates strictly to read_at", () => {
  assert.match(migrationSql, /create or replace function public\.guard_notification_changes\(\)/i);
  assert.match(migrationSql, /Only read_at can be updated on notifications/i);
  assert.match(migrationSql, /create trigger notifications_update_guard/i);
  assert.match(migrationSql, /revoke execute on function public\.guard_notification_changes\(\) from public, anon, authenticated/i);
});

test("Step 2: Migration safely registers notifications table with supabase_realtime publication", () => {
  assert.match(migrationSql, /select 1 from pg_publication where pubname = 'supabase_realtime'/i);
  assert.match(migrationSql, /alter publication supabase_realtime add table public\.notifications/i);
});

test("Step 3: Database trigger fires only on non-paid to paid status transition", () => {
  assert.match(
    migrationSql,
    /create trigger on_invoice_paid_notification\s+after update of status on public\.invoices\s+for each row\s+when\s*\(\s*old\.status is distinct from 'paid' and new\.status = 'paid'\s*\)\s+execute function public\.create_invoice_paid_notification\(\)/i
  );
});

test("Step 3: Trigger resolves business owner and links to invoice detail page with amount and deduplication", () => {
  assert.match(migrationSql, /create or replace function public\.create_invoice_paid_notification\(\)/i);
  assert.match(migrationSql, /security definer/i);
  assert.match(migrationSql, /set search_path = ''/i);

  // Resolves recipient from business_profiles
  assert.match(migrationSql, /select bp\.owner_user_id,\s*bp\.id\s+into v_recipient_user_id,\s*v_business_id\s+from public\.business_profiles bp/i);

  // Link to existing business owner invoice detail page
  assert.ok(migrationSql.includes("v_url := '/dashboard/invoices/' || new.id::text;"));

  // Uses ON CONFLICT DO NOTHING to prevent duplicates
  assert.match(migrationSql, /on conflict\s*\(\s*recipient_user_id,\s*invoice_id,\s*type\s*\)\s*do nothing/i);

  // Revoke execution from PostgREST callers
  assert.match(migrationSql, /revoke execute on function public\.create_invoice_paid_notification\(\) from public, anon, authenticated/i);
});

test("Step 3: Critical isolation requirement - notification insertion errors never fail the invoice status update", () => {
  // Wrapped in inner block with exception handler
  assert.match(migrationSql, /begin[\s\S]*?exception\s+when\s+others\s+then[\s\S]*?raise warning[\s\S]*?end;/i);
  assert.match(migrationSql, /raise warning 'create_invoice_paid_notification failed for invoice %: % \(%\)'/i);
});

test("TypeScript database types include notifications table with restricted update schema", () => {
  assert.match(databaseTypes, /notifications:\s*\{/);
  assert.match(databaseTypes, /recipient_user_id:\s*string/);
  assert.match(databaseTypes, /business_id:\s*string/);
  assert.match(databaseTypes, /type:\s*string/);
  assert.match(databaseTypes, /title:\s*string/);
  assert.match(databaseTypes, /message:\s*string/);
  assert.match(databaseTypes, /invoice_id:\s*string\s*\|\s*null/);
  assert.match(databaseTypes, /destination_url:\s*string\s*\|\s*null/);
  assert.match(databaseTypes, /read_at:\s*string\s*\|\s*null/);
  assert.match(databaseTypes, /Update:\s*\{\s*read_at\?:\s*string\s*\|\s*null;\s*\}/);
});
