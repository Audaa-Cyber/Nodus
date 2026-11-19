-- Move ownership from Supabase Auth UUIDs to WorkOS subject IDs.
-- The production database is new and contains no merchant data.
alter table public.business_profiles drop constraint if exists business_profiles_owner_user_id_fkey;
alter table public.business_profiles alter column owner_user_id type text using owner_user_id::text;
alter table public.notifications drop constraint if exists notifications_recipient_user_id_fkey;
alter table public.notifications alter column recipient_user_id type text using recipient_user_id::text;

drop trigger if exists on_auth_user_created_business on auth.users;
drop trigger if exists on_auth_user_email_updated on auth.users;
drop function if exists public.create_business_profile_for_user();
drop function if exists public.sync_business_profile_email();

drop policy if exists "Owners can view their business profile" on public.business_profiles;
drop policy if exists "Owners can update their business profile" on public.business_profiles;
drop policy if exists "Owners can view their invoices" on public.invoices;
drop policy if exists "Owners can create their invoices" on public.invoices;
drop policy if exists "Owners can update their invoices" on public.invoices;
drop policy if exists "Business owner reads invoice feedback" on public.invoice_feedback;
drop policy if exists "Users can view their own notifications" on public.notifications;
drop policy if exists "Users can update their own notification read status" on public.notifications;
drop policy if exists "Business owners can view payment attempts" on public.payment_attempts;
drop policy if exists "Business owners can view payment settlements" on public.payment_settlements;
drop policy if exists "Business owners can view payment receipts" on public.payment_receipts;
drop policy if exists "Business owners can upload invoice logos" on storage.objects;

create policy "Owners can view their business profile" on public.business_profiles
for select to authenticated using (owner_user_id = (auth.jwt() ->> 'sub'));
create policy "Owners can create their business profile" on public.business_profiles
for insert to authenticated with check (owner_user_id = (auth.jwt() ->> 'sub'));
create policy "Owners can update their business profile" on public.business_profiles
for update to authenticated using (owner_user_id = (auth.jwt() ->> 'sub'))
with check (owner_user_id = (auth.jwt() ->> 'sub'));

create policy "Owners can view their invoices" on public.invoices
for select to authenticated using (
  exists (select 1 from public.business_profiles bp where bp.id = business_id and bp.owner_user_id = (auth.jwt() ->> 'sub'))
);
create policy "Owners can create their invoices" on public.invoices
for insert to authenticated with check (
  exists (select 1 from public.business_profiles bp where bp.id = business_id and bp.owner_user_id = (auth.jwt() ->> 'sub'))
);
create policy "Owners can update their invoices" on public.invoices
for update to authenticated using (
  exists (select 1 from public.business_profiles bp where bp.id = business_id and bp.owner_user_id = (auth.jwt() ->> 'sub'))
) with check (
  exists (select 1 from public.business_profiles bp where bp.id = business_id and bp.owner_user_id = (auth.jwt() ->> 'sub'))
);

create policy "Business owner reads invoice feedback" on public.invoice_feedback
for select to authenticated using (
  exists (select 1 from public.business_profiles bp
    where bp.id = invoice_feedback.business_id and bp.owner_user_id = (auth.jwt() ->> 'sub'))
);
create policy "Users can view their own notifications" on public.notifications
for select to authenticated using (recipient_user_id = (auth.jwt() ->> 'sub'));
create policy "Users can update their own notification read status" on public.notifications
for update to authenticated using (recipient_user_id = (auth.jwt() ->> 'sub'))
with check (recipient_user_id = (auth.jwt() ->> 'sub'));
create policy "Business owners can view payment attempts" on public.payment_attempts
for select to authenticated using (
  exists (select 1 from public.business_profiles bp
    where bp.id = payment_attempts.business_id and bp.owner_user_id = (auth.jwt() ->> 'sub'))
);
create policy "Business owners can view payment settlements" on public.payment_settlements
for select to authenticated using (
  exists (select 1 from public.business_profiles bp
    where bp.id = payment_settlements.business_id and bp.owner_user_id = (auth.jwt() ->> 'sub'))
);
create policy "Business owners can view payment receipts" on public.payment_receipts
for select to authenticated using (
  exists (select 1 from public.business_profiles bp
    where bp.id = payment_receipts.business_id and bp.owner_user_id = (auth.jwt() ->> 'sub'))
);
create policy "Business owners can upload invoice logos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'business-logos' and exists (
    select 1 from public.business_profiles bp
    where bp.id::text = (storage.foldername(name))[1]
      and bp.owner_user_id = (auth.jwt() ->> 'sub')
  )
);

alter table public.notifications alter column recipient_user_id type text using recipient_user_id::text;

-- Businesses may accept any subset of the four supported USDC destination networks.
alter table public.business_profiles add column if not exists receiving_networks text[] not null default '{}';
update public.business_profiles
set receiving_networks = case
  when receiving_network in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia')
    then array[receiving_network]::text[]
  else '{}'::text[]
end
where cardinality(receiving_networks) = 0;
alter table public.business_profiles
  drop constraint if exists business_receiving_destination_pair;
alter table public.business_profiles
  add constraint business_receiving_networks_supported
  check (cardinality(receiving_networks) <= 4 and receiving_networks <@ array['sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia']::text[]);
alter table public.business_profiles
  add constraint business_receiving_address_required
  check ((cardinality(receiving_networks) = 0 and receiving_address is null) or (cardinality(receiving_networks) > 0 and receiving_address is not null));
grant insert on public.business_profiles to authenticated;
grant update (receiving_address, receiving_network, receiving_networks) on public.business_profiles to authenticated;

alter table public.invoices
  add column if not exists payment_networks text[] not null default '{}',
  add column if not exists payment_receiving_address text;
alter table public.invoices
  add constraint invoices_payment_networks_supported
  check (cardinality(payment_networks) <= 4 and payment_networks <@ array['sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia']::text[]);
alter table public.invoices
  add constraint invoices_open_payment_destination_required
  check (status not in ('open','overdue') or (cardinality(payment_networks) between 1 and 4 and payment_receiving_address is not null));

-- Keep the existing public payment-context RPC signature for existing checkout callers,
-- but resolve the immutable destination snapshot from the issued invoice.
create or replace function public.lookup_shared_payment_context(p_token_hash text)
returns table (
  invoice_id uuid, business_id uuid, invoice_number text, business_name text,
  amount_minor bigint, currency text, invoice_status public.invoice_status,
  receiving_address text, receiving_network text
)
language sql stable security definer set search_path = '' as $$
  select i.id, i.business_id, i.invoice_number, bp.business_name,
    i.amount_minor, i.currency,
    case when i.status = 'open' and i.due_date < current_date then 'overdue'::public.invoice_status else i.status end,
    coalesce(i.payment_receiving_address, bp.receiving_address),
    coalesce(i.payment_networks[1], bp.receiving_network)
  from public.invoices i join public.business_profiles bp on bp.id = i.business_id
  where p_token_hash ~ '^[0-9a-f]{64}$' and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  limit 1;
$$;

create or replace function public.lookup_shared_payment_networks(p_token_hash text)
returns table (invoice_id uuid, receiving_address text, receiving_networks text[])
language sql stable security definer set search_path = '' as $$
  select i.id, coalesce(i.payment_receiving_address, bp.receiving_address),
    coalesce(nullif(i.payment_networks, '{}'::text[]), bp.receiving_networks)
  from public.invoices i
  join public.business_profiles bp on bp.id = i.business_id
  where p_token_hash ~ '^[0-9a-f]{64}$'
    and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
    and i.status in ('open','overdue')
  limit 1;
$$;
revoke all on function public.lookup_shared_payment_networks(text) from public;
grant execute on function public.lookup_shared_payment_networks(text) to anon, authenticated;

-- Preserve immutable paid-invoice protection for the new payment destination snapshot.
create or replace function public.guard_invoice_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'open') then raise exception 'Invoices can only be created as draft or open'; end if;
    return new;
  end if;
  if old.status = 'paid' then
    if current_user <> 'postgres' then raise exception 'Paid invoices cannot be changed'; end if;
    if row(new.id,new.business_id,new.invoice_number,new.customer_name,new.customer_email,new.description,new.amount_minor,new.currency,new.issue_date,new.due_date,new.status,new.created_at,new.updated_at,new.line_items,new.subtotal_minor,new.tax_rate_bps,new.discount_minor,new.invoice_footer,new.seller_snapshot,new.payment_networks,new.payment_receiving_address)
       is distinct from
       row(old.id,old.business_id,old.invoice_number,old.customer_name,old.customer_email,old.description,old.amount_minor,old.currency,old.issue_date,old.due_date,old.status,old.created_at,old.updated_at,old.line_items,old.subtotal_minor,old.tax_rate_bps,old.discount_minor,old.invoice_footer,old.seller_snapshot,old.payment_networks,old.payment_receiving_address)
    then raise exception 'Paid invoices cannot be changed'; end if;
    return new;
  end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' then raise exception 'Cancelled invoices cannot be reopened'; end if;
  if new.status = 'overdue' and (new.due_date is null or new.due_date >= current_date) then raise exception 'Only invoices past their due date can be overdue'; end if;
  if old.status = 'draft' and new.status not in ('draft','open','cancelled') then raise exception 'Invalid invoice status transition'; end if;
  if new.status = 'paid' and (current_user <> 'postgres'
    or current_setting('nodus.payment_reconciliation', true) is distinct from 'verified') then
    raise exception 'Paid status requires verified settlement';
  end if;
  if old.status = 'open' and new.status not in ('open','overdue','cancelled','paid') then raise exception 'Invalid invoice status transition'; end if;
  if old.status = 'overdue' and new.status not in ('overdue','open','cancelled','paid') then raise exception 'Invalid invoice status transition'; end if;
  return new;
end;
$$;

-- NEAR invoice registration and settlement were not part of Nodus's required invoice flow.
drop table if exists public.near_reconciliation_status cascade;
drop table if exists public.near_invoice_registration_outbox cascade;
drop table if exists public.near_settlement_outbox cascade;
drop function if exists public.cctp_near_settlement_evidence_eligible(public.payment_settlements, public.payment_attempts) cascade;
drop function if exists public.near_settlement_evidence_eligible(public.payment_settlements, public.payment_attempts) cascade;
drop function if exists public.block_near_settlement_outbox(uuid, uuid, text) cascade;
drop function if exists public.claim_near_invoice_registration_outbox(integer) cascade;
drop function if exists public.claim_near_settlement_outbox(integer) cascade;
drop function if exists public.enqueue_near_invoice_registration() cascade;
drop function if exists public.enqueue_verified_near_settlement() cascade;
drop function if exists public.fail_near_invoice_registration(uuid, uuid, text) cascade;
drop function if exists public.finish_near_invoice_registration(uuid, uuid, text, text) cascade;
drop function if exists public.finish_near_settlement_outbox(uuid, uuid, text) cascade;
drop function if exists public.mark_near_invoice_registration_submitted(uuid, uuid, text) cascade;
drop function if exists public.record_near_settlement_submission(uuid, uuid, text) cascade;
drop function if exists public.requeue_near_invoice_registration(uuid) cascade;
drop function if exists public.requeue_near_settlement_outbox(uuid) cascade;
drop function if exists public.retry_near_invoice_registration(uuid, uuid, text) cascade;
drop function if exists public.retry_near_settlement_outbox(uuid, uuid, text) cascade;
drop function if exists public.sync_near_reconciliation_status() cascade;
alter table public.invoices
  drop column if exists near_registration_status,
  drop column if exists near_registration_transaction_hash,
  drop column if exists near_invoice_reference,
  drop column if exists near_registered_at,
  drop column if exists near_registration_failure_reason;
