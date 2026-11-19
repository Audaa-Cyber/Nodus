-- Tighten exposed table grants, preserve the app's intended read/write surface,
-- and resolve the initial security/performance findings from the clean production DB.

-- Supabase's default grants are broader than the RLS policies require.
revoke all on all tables in schema public from public, anon, authenticated;

grant select on public.business_profiles to authenticated;
grant update (
  business_name,
  receiving_address,
  receiving_network,
  logo_url,
  invoice_prefix,
  default_currency,
  default_payment_terms_days,
  invoice_footer,
  business_phone,
  business_address,
  website_url,
  tax_registration_number
) on public.business_profiles to authenticated;

grant select, insert, update on public.invoices to authenticated;
grant select on public.payment_attempts to authenticated;
grant select on public.payment_settlements to authenticated;
grant select on public.payment_receipts to authenticated;
grant select, update (read_at) on public.notifications to authenticated;
grant select on public.near_reconciliation_status to authenticated;
grant select on public.invoice_feedback to authenticated;

-- These tables are worker/internal state. Keep them service-role only.
revoke all on public.near_invoice_registration_outbox from public, anon, authenticated;
revoke all on public.near_settlement_outbox from public, anon, authenticated;
revoke all on public.payment_settlement_transactions from public, anon, authenticated;

-- Trigger functions should not be callable through the public Data API.
revoke execute on function public.index_settlement_transaction_references() from public, anon, authenticated;

-- Keep the owner check but evaluate auth.uid() once per statement.
drop policy if exists "Business owner reads invoice feedback" on public.invoice_feedback;
create policy "Business owner reads invoice feedback" on public.invoice_feedback
for select to authenticated
using (
  exists (
    select 1
    from public.business_profiles bp
    where bp.id = invoice_feedback.business_id
      and bp.owner_user_id = (select auth.uid())
  )
);

-- Cover foreign keys used for joins, deletes, and worker cleanup.
create index if not exists invoice_feedback_business_id_idx
  on public.invoice_feedback (business_id);
create index if not exists near_reconciliation_status_business_id_idx
  on public.near_reconciliation_status (business_id);
create index if not exists near_reconciliation_status_invoice_id_idx
  on public.near_reconciliation_status (invoice_id);
create index if not exists near_settlement_outbox_invoice_id_idx
  on public.near_settlement_outbox (invoice_id);
create index if not exists payment_attempts_invoice_business_idx
  on public.payment_attempts (invoice_id, business_id);
create index if not exists payment_attempts_business_id_idx
  on public.payment_attempts (business_id);
create index if not exists payment_receipts_invoice_business_idx
  on public.payment_receipts (invoice_id, business_id);
create index if not exists payment_receipts_business_id_idx
  on public.payment_receipts (business_id);
create index if not exists payment_settlements_invoice_business_idx
  on public.payment_settlements (invoice_id, business_id);
create index if not exists payment_settlements_business_id_idx
  on public.payment_settlements (business_id);
