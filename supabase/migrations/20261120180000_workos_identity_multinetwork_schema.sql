-- WorkOS identity and merchant/invoice network schema.
-- WorkOS user IDs are opaque strings, not UUIDs.

drop policy if exists "Owners can view their business profile" on public.business_profiles;
drop policy if exists "Owners can update their business profile" on public.business_profiles;
drop policy if exists "Owners can create their business profile" on public.business_profiles;
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
drop policy if exists "Business owners can view NEAR reconciliation status" on public.near_reconciliation_status;

alter table public.business_profiles drop constraint if exists business_profiles_owner_user_id_fkey;
alter table public.notifications drop constraint if exists notifications_recipient_user_id_fkey;
alter table public.business_profiles alter column owner_user_id type text using owner_user_id::text;
alter table public.notifications alter column recipient_user_id type text using recipient_user_id::text;

drop trigger if exists on_auth_user_created_business on auth.users;
drop trigger if exists on_auth_user_email_updated on auth.users;
drop function if exists public.create_business_profile_for_user() cascade;
drop function if exists public.sync_business_profile_email() cascade;

create policy "Owners can view their business profile" on public.business_profiles
for select to authenticated using (owner_user_id = (auth.jwt() ->> 'sub'));
create policy "Owners can create their business profile" on public.business_profiles
for insert to authenticated with check (owner_user_id = (auth.jwt() ->> 'sub'));
create policy "Owners can update their business profile" on public.business_profiles
for update to authenticated using (owner_user_id = (auth.jwt() ->> 'sub'))
with check (owner_user_id = (auth.jwt() ->> 'sub'));

create policy "Owners can view their invoices" on public.invoices
for select to authenticated using (
  exists (select 1 from public.business_profiles bp
    where bp.id = invoices.business_id and bp.owner_user_id = (auth.jwt() ->> 'sub'))
);
create policy "Owners can create their invoices" on public.invoices
for insert to authenticated with check (
  exists (select 1 from public.business_profiles bp
    where bp.id = invoices.business_id and bp.owner_user_id = (auth.jwt() ->> 'sub'))
);
create policy "Owners can update their invoices" on public.invoices
for update to authenticated using (
  exists (select 1 from public.business_profiles bp
    where bp.id = invoices.business_id and bp.owner_user_id = (auth.jwt() ->> 'sub'))
) with check (
  exists (select 1 from public.business_profiles bp
    where bp.id = invoices.business_id and bp.owner_user_id = (auth.jwt() ->> 'sub'))
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

-- Restrict all merchant data access to the two trusted WorkOS environments.
do $$
declare
  v_issuers text[] := array[
    'https://api.workos.com/user_management/client_01M7T841PNMYSWF6CYPTWWK7MH',
    'https://api.workos.com/user_management/client_01M7T841Y5D7AJZHVW8YSTJ9EG'
  ];
  v_table text;
begin
  foreach v_table in array array[
    'public.business_profiles','public.invoices','public.invoice_feedback',
    'public.notifications','public.payment_attempts','public.payment_settlements',
    'public.payment_receipts'
  ] loop
    execute format('drop policy if exists %I on %s', 'workos_issuer_guard', v_table);
    execute format(
      'create policy %I on %s as restrictive for all to authenticated using ((auth.jwt() ->> ''iss'') = any (%L::text[])) with check ((auth.jwt() ->> ''iss'') = any (%L::text[]))',
      'workos_issuer_guard', v_table, v_issuers, v_issuers
    );
  end loop;
end;
$$;

drop policy if exists "workos_issuer_guard" on storage.objects;
create policy "workos_issuer_guard" on storage.objects
as restrictive for all to authenticated
using ((auth.jwt() ->> 'iss') in (
  'https://api.workos.com/user_management/client_01M7T841PNMYSWF6CYPTWWK7MH',
  'https://api.workos.com/user_management/client_01M7T841Y5D7AJZHVW8YSTJ9EG'
))
with check ((auth.jwt() ->> 'iss') in (
  'https://api.workos.com/user_management/client_01M7T841PNMYSWF6CYPTWWK7MH',
  'https://api.workos.com/user_management/client_01M7T841Y5D7AJZHVW8YSTJ9EG'
));

grant insert on public.business_profiles to authenticated;

alter table public.business_profiles
  add column if not exists receiving_networks text[] not null default '{}';

update public.business_profiles
set receiving_networks = case
  when receiving_network in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    then array[receiving_network]::text[]
  when receiving_network in ('arc','arc_testnet') then array['arc-testnet']::text[]
  when receiving_network = 'ethereum-sepolia' then array['sepolia']::text[]
  else '{}'::text[]
end
where cardinality(receiving_networks) = 0;

update public.business_profiles
set receiving_network = receiving_networks[1]
where cardinality(receiving_networks) > 0;

alter table public.business_profiles
  drop constraint if exists business_receiving_destination_pair,
  drop constraint if exists business_receiving_networks_supported,
  drop constraint if exists business_receiving_address_required,
  drop constraint if exists business_receiving_address_evm;

alter table public.business_profiles
  add constraint business_receiving_networks_supported
    check (
      cardinality(receiving_networks) <= 5
      and receiving_networks <@ array['sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet']::text[]
    ),
  add constraint business_receiving_address_required
    check (
      (cardinality(receiving_networks) = 0 and receiving_address is null)
      or (cardinality(receiving_networks) > 0 and receiving_address is not null)
    ),
  add constraint business_receiving_address_evm
    check (receiving_address is null or receiving_address ~ '^0x[0-9a-fA-F]{40}$');

grant update (business_name, receiving_address, receiving_network, receiving_networks)
  on public.business_profiles to authenticated;

alter table public.invoices
  add column if not exists payment_networks text[] not null default '{}',
  add column if not exists payment_receiving_address text;

update public.invoices i
set payment_networks = bp.receiving_networks,
    payment_receiving_address = bp.receiving_address
from public.business_profiles bp
where bp.id = i.business_id
  and i.status in ('open','overdue')
  and cardinality(i.payment_networks) = 0
  and bp.receiving_address is not null
  and cardinality(bp.receiving_networks) > 0;

alter table public.invoices
  drop constraint if exists invoices_payment_networks_supported,
  drop constraint if exists invoices_open_payment_destination_required,
  drop constraint if exists invoices_payment_receiving_address_evm;

alter table public.invoices
  add constraint invoices_payment_networks_supported
    check (
      cardinality(payment_networks) <= 5
      and payment_networks <@ array['sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet']::text[]
    ),
  add constraint invoices_open_payment_destination_required
    check (
      status not in ('open','overdue')
      or (cardinality(payment_networks) between 1 and 5 and payment_receiving_address is not null)
    ),
  add constraint invoices_payment_receiving_address_evm
    check (payment_receiving_address is null or payment_receiving_address ~ '^0x[0-9a-fA-F]{40}$');

drop function if exists public.block_near_settlement_outbox(uuid, uuid, text) cascade;
drop function if exists public.cctp_near_settlement_evidence_eligible(public.payment_settlements, public.payment_attempts) cascade;
drop function if exists public.near_settlement_evidence_eligible(public.payment_settlements, public.payment_attempts) cascade;
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

drop table if exists public.near_reconciliation_status cascade;
drop table if exists public.near_invoice_registration_outbox cascade;
drop table if exists public.near_settlement_outbox cascade;

alter table public.invoices
  drop column if exists near_registration_status,
  drop column if exists near_registration_transaction_hash,
  drop column if exists near_invoice_reference,
  drop column if exists near_registered_at,
  drop column if exists near_registration_failure_reason;
