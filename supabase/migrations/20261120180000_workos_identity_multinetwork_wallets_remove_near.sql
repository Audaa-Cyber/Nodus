-- WorkOS identity, merchant-owned EVM destinations, five-network checkout, and NEAR cleanup.
-- WorkOS subject IDs are opaque strings, not UUIDs. The database authorizes by JWT sub + issuer.

-- Remove legacy Supabase Auth policies before changing the UUID owner columns.
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

alter table public.business_profiles drop constraint if exists business_profiles_owner_user_id_fkey;
alter table public.notifications drop constraint if exists notifications_recipient_user_id_fkey;
alter table public.business_profiles alter column owner_user_id type text using owner_user_id::text;
alter table public.notifications alter column recipient_user_id type text using recipient_user_id::text;

-- WorkOS provisions the merchant profile on first authenticated visit.
drop trigger if exists on_auth_user_created_business on auth.users;
drop trigger if exists on_auth_user_email_updated on auth.users;
drop function if exists public.create_business_profile_for_user() cascade;
drop function if exists public.sync_business_profile_email() cascade;

-- WorkOS issuer allowlist. Keep these synchronized with the Staging and Production
-- WORKOS_CLIENT_ID values configured for Nodus.
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

-- Prevent subject collisions across trusted JWT issuers.
do $$
declare
  v_issuers text[] := array[
    'https://api.workos.com/user_management/client_01M7T841PNMYSWF6CYPTWWK7MH',
    'https://api.workos.com/user_management/client_01M7T841Y5D7AJZHVW8YSTJ9EG'
  ];
  v_table text;
begin
  foreach v_table in array array[
    'public.business_profiles',
    'public.invoices',
    'public.invoice_feedback',
    'public.notifications',
    'public.payment_attempts',
    'public.payment_settlements',
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

-- One external EVM address is reused on any selected supported network.
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

alter table public.business_profiles
  drop constraint if exists business_receiving_destination_pair,
  drop constraint if exists business_receiving_networks_supported,
  drop constraint if exists business_receiving_address_required,
  drop constraint if exists business_receiving_address_evm;

update public.business_profiles
set receiving_network = receiving_networks[1]
where cardinality(receiving_networks) > 0;

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
    check (receiving_address is null or receiving_address ~ '^0x[0-9a-fA-F]{40}
  add column if not exists payment_networks text[] not null default '{}',
  add column if not exists payment_receiving_address text;

-- Backfill any already-issued invoices before enforcing immutable payment terms.
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

-- The payer-facing context returns the immutable invoice destination, not live merchant settings.
create or replace function public.lookup_shared_payment_context(p_token_hash text)
returns table (
  invoice_id uuid,
  business_id uuid,
  invoice_number text,
  business_name text,
  amount_minor bigint,
  currency text,
  invoice_status public.invoice_status,
  receiving_address text,
  receiving_network text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    i.id,
    i.business_id,
    i.invoice_number,
    bp.business_name,
    i.amount_minor,
    i.currency,
    case
      when i.status = 'open' and i.due_date < current_date then 'overdue'::public.invoice_status
      else i.status
    end,
    coalesce(i.payment_receiving_address, bp.receiving_address),
    coalesce(i.payment_networks[1], bp.receiving_network)
  from public.invoices i
  join public.business_profiles bp on bp.id = i.business_id
  where p_token_hash ~ '^[0-9a-f]{64}$'
    and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  limit 1;
$function$;

create or replace function public.lookup_shared_payment_networks(p_token_hash text)
returns table (
  invoice_id uuid,
  receiving_address text,
  receiving_networks text[]
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    i.id,
    coalesce(i.payment_receiving_address, bp.receiving_address),
    coalesce(nullif(i.payment_networks, '{}'::text[]), bp.receiving_networks)
  from public.invoices i
  join public.business_profiles bp on bp.id = i.business_id
  where p_token_hash ~ '^[0-9a-f]{64}$'
    and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
    and i.status in ('open','overdue')
  limit 1;
$function$;
revoke all on function public.lookup_shared_payment_networks(text) from public;
grant execute on function public.lookup_shared_payment_networks(text) to anon, authenticated;

-- Issued payment destinations cannot be changed after the invoice is opened.
create or replace function public.guard_invoice_changes()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'open') then
      raise exception 'Invoices can only be created as draft or open';
    end if;
    return new;
  end if;

  if old.status <> 'draft'
    and row(new.payment_networks, new.payment_receiving_address)
      is distinct from row(old.payment_networks, old.payment_receiving_address) then
    raise exception 'Invoice payment destination is immutable after issue';
  end if;

  if old.status = 'paid' then
    if current_user <> 'postgres' then
      raise exception 'Paid invoices cannot be changed';
    end if;
    if row(
      new.id,new.business_id,new.invoice_number,new.customer_name,new.customer_email,
      new.description,new.amount_minor,new.currency,new.issue_date,new.due_date,new.status,
      new.created_at,new.updated_at,new.line_items,new.subtotal_minor,new.tax_rate_bps,
      new.discount_minor,new.invoice_footer,new.seller_snapshot,
      new.payment_networks,new.payment_receiving_address
    ) is distinct from row(
      old.id,old.business_id,old.invoice_number,old.customer_name,old.customer_email,
      old.description,old.amount_minor,old.currency,old.issue_date,old.due_date,old.status,
      old.created_at,old.updated_at,old.line_items,old.subtotal_minor,old.tax_rate_bps,
      old.discount_minor,old.invoice_footer,old.seller_snapshot,
      old.payment_networks,old.payment_receiving_address
    ) then
      raise exception 'Paid invoices cannot be changed';
    end if;
    return new;
  end if;

  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'Cancelled invoices cannot be reopened';
  end if;
  if new.status = 'overdue' and (new.due_date is null or new.due_date >= current_date) then
    raise exception 'Only invoices past their due date can be overdue';
  end if;
  if old.status = 'draft' and new.status not in ('draft','open','cancelled') then
    raise exception 'Invalid invoice status transition';
  end if;
  if new.status = 'paid' and (
    current_user <> 'postgres'
    or current_setting('nodus.payment_reconciliation', true) is distinct from 'verified'
  ) then
    raise exception 'Paid status requires verified settlement';
  end if;
  if old.status = 'open' and new.status not in ('open','overdue','cancelled','paid') then
    raise exception 'Invalid invoice status transition';
  end if;
  if old.status = 'overdue' and new.status not in ('overdue','open','cancelled','paid') then
    raise exception 'Invalid invoice status transition';
  end if;
  return new;
end;
$function$;

-- Bind each committed payment attempt to a network and wallet address explicitly selected on the invoice.
create or replace function public.create_committed_payment_attempt(
  p_token_hash text,
  p_idempotency_key uuid,
  p_source_asset_id text,
  p_source_network text,
  p_destination_asset_id text,
  p_destination_network text,
  p_recipient_address text,
  p_requested_amount text,
  p_expected_received_amount text,
  p_deposit_address text,
  p_deposit_memo text,
  p_quote_expires_at timestamp with time zone,
  p_quote_snapshot jsonb
)
returns setof public.payment_attempts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_context record;
  v_invoice public.invoices%rowtype;
begin
  select * into v_context
  from public.lookup_shared_payment_context(p_token_hash);

  if not found or v_context.invoice_status not in ('open','overdue') then
    raise exception 'invoice_unavailable' using errcode = 'P0002';
  end if;

  if p_requested_amount !~ '^[0-9]+$'
    or p_expected_received_amount !~ '^[0-9]+([.][0-9]+)?$'
    or p_quote_snapshot is null
    or p_deposit_address is null then
    raise exception 'invalid_quote_snapshot' using errcode = '22023';
  end if;

  select * into v_invoice
  from public.invoices
  where id = v_context.invoice_id
  for update;

  if not found or v_invoice.status not in ('open','overdue') then
    raise exception 'invoice_unavailable' using errcode = 'P0002';
  end if;

  if p_source_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    or p_destination_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    or p_source_asset_id <> p_source_network || ':usdc'
    or p_destination_asset_id <> p_destination_network || ':usdc'
    or not (p_destination_network = any(v_invoice.payment_networks))
    or p_recipient_address is null
    or lower(p_recipient_address) <> lower(coalesce(v_invoice.payment_receiving_address, '')) then
    raise exception 'invoice_payment_terms_mismatch' using errcode = '22023';
  end if;

  return query
  select pa.*
  from public.payment_attempts pa
  where pa.invoice_id = v_invoice.id
    and pa.idempotency_key = p_idempotency_key
    and pa.status in ('PENDING_DEPOSIT','PROCESSING','KNOWN_DEPOSIT_TX');
  if found then
    return;
  end if;

  update public.payment_attempts pa
  set status = 'QUOTE_EXPIRED',
      circle_recovery_updated_at = statement_timestamp()
  where pa.invoice_id = v_invoice.id
    and pa.mode = 'live'
    and pa.status in ('PENDING_DEPOSIT','MOCK_QUOTE_READY')
    and pa.quote_expires_at is not null
    and pa.quote_expires_at <= statement_timestamp()
    and pa.circle_execution_reserved_at is null
    and pa.transaction_hash is null
    and pa.circle_approval_tx_hash is null
    and pa.settlement_resolved_at is null;

  if exists (
    select 1
    from public.payment_attempts pa
    where pa.invoice_id = v_invoice.id
      and (
        pa.status in ('MOCK_QUOTE_READY','PENDING_DEPOSIT','KNOWN_DEPOSIT_TX','PROCESSING')
        or (pa.mode = 'live' and pa.status = 'SUCCESS')
      )
  ) then
    raise exception 'active_payment_attempt_exists' using errcode = '23505';
  end if;

  return query
  insert into public.payment_attempts (
    invoice_id,business_id,mode,source_asset_id,source_network,
    destination_asset_id,destination_network,recipient_address,idempotency_key,
    requested_amount,expected_received_amount,deposit_address,deposit_memo,
    quote_expires_at,quote_snapshot,status
  ) values (
    v_invoice.id,v_invoice.business_id,'live',p_source_asset_id,p_source_network,
    p_destination_asset_id,p_destination_network,p_recipient_address,p_idempotency_key,
    p_requested_amount,p_expected_received_amount,p_deposit_address,p_deposit_memo,
    p_quote_expires_at,p_quote_snapshot,'PENDING_DEPOSIT'
  )
  returning *;
end;
$function$;

create or replace function public.allocate_invoice_number(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_prefix text;
  v_sequence bigint;
  v_user_id text;
  v_issuer text;
begin
  v_user_id := auth.jwt() ->> 'sub';
  v_issuer := auth.jwt() ->> 'iss';
  if v_user_id is null or v_user_id = ''
    or v_issuer not in (
      'https://api.workos.com/user_management/client_01M7T841PNMYSWF6CYPTWWK7MH',
      'https://api.workos.com/user_management/client_01M7T841Y5D7AJZHVW8YSTJ9EG'
    ) then
    raise exception 'Not authorized to allocate invoice number';
  end if;

  update public.business_profiles
  set next_invoice_number = next_invoice_number + 1
  where id = p_business_id
    and owner_user_id = v_user_id
  returning invoice_prefix, next_invoice_number - 1 into v_prefix, v_sequence;

  if v_sequence is null then
    raise exception 'Business profile not found';
  end if;
  return v_prefix || '-' || to_char(current_date, 'YYYY') || '-' || lpad(v_sequence::text, 4, '0');
end;
$function$;

create or replace function public.merchant_nodus_received_by_chain()
returns table(destination_network text, total_base_units text, payment_count bigint)
language sql
stable
set search_path = ''
as $function$
  with eligible_settlements as (
    select distinct on (ps.id)
      ps.id, ps.destination_network, ps.received_amount_base_units
    from public.business_profiles bp
    join public.invoices i on i.business_id = bp.id
    join public.payment_attempts pa on pa.invoice_id = i.id and pa.business_id = bp.id
    join public.payment_settlements ps on ps.invoice_id = i.id
      and ps.business_id = bp.id and ps.payment_attempt_id = pa.id
    where bp.owner_user_id = (auth.jwt() ->> 'sub')
      and i.status = 'paid'
      and pa.mode = 'live'
      and pa.status = 'SUCCESS'
      and ps.provider_status = 'SUCCESS'
      and ps.outcome = 'VERIFIED'
      and ps.destination_network = pa.destination_network
      and ps.destination_asset_id = pa.destination_asset_id
      and ps.destination_asset_id = ps.destination_network || ':usdc'
      and ps.received_asset_decimals = 6
      and ps.received_amount_base_units ~ '^[0-9]+$'
      and ps.received_amount_base_units::numeric > 0
      and ps.destination_network in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    order by ps.id
  )
  select
    eligible.destination_network,
    sum(eligible.received_amount_base_units::numeric)::text,
    count(*)::bigint
  from eligible_settlements eligible
  group by eligible.destination_network
  order by eligible.destination_network;
$function$;

create or replace function public.create_invoice_paid_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_recipient_user_id text;
  v_business_id uuid;
  v_title text;
  v_message text;
  v_amount_text text;
  v_url text;
begin
  begin
    if old.status is distinct from 'paid' and new.status = 'paid' then
      select bp.owner_user_id, bp.id
      into v_recipient_user_id, v_business_id
      from public.business_profiles bp
      where bp.id = new.business_id;

      if v_recipient_user_id is not null then
        if new.amount_minor is not null and new.currency is not null then
          v_amount_text := trim(to_char(new.amount_minor::numeric / 100.0, 'FM999,999,999,990.00')) || ' ' || new.currency;
        else
          v_amount_text := 'amount confirmed';
        end if;
        v_title := 'Payment received for ' || coalesce(new.invoice_number, 'invoice');
        v_message := 'Invoice ' || coalesce(new.invoice_number, '') || ' was paid (' || v_amount_text || ').';
        v_url := '/dashboard/invoices/' || new.id::text;

        insert into public.notifications (
          recipient_user_id,business_id,type,title,message,invoice_id,destination_url
        ) values (
          v_recipient_user_id,v_business_id,'invoice_paid',v_title,v_message,new.id,v_url
        ) on conflict (recipient_user_id, invoice_id, type) do nothing;
      end if;
    end if;
  exception when others then
    raise warning 'create_invoice_paid_notification failed for invoice %: % (%)',
      new.id, sqlerrm, sqlstate;
  end;
  return new;
end;
$function$;

create or replace function public.mark_circle_execution_started(
  p_token_hash text,
  p_attempt_id uuid,
  p_expected_payer text
)
returns setof public.payment_attempts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempt public.payment_attempts%rowtype;
  v_invoice public.invoices%rowtype;
  v_business public.business_profiles%rowtype;
  v_snapshot jsonb;
  v_snapshot_expiry timestamptz;
  v_received numeric;
  v_total_debit numeric;
  v_fee_total numeric;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_expected_payer is null or p_expected_payer !~ '^0x[0-9a-fA-F]{40}$' then
    raise exception 'invalid_execution_reservation_request' using errcode = '22023';
  end if;

  perform 1
  from public.payment_attempts pa
  join public.invoices i on i.id = pa.invoice_id
  join public.business_profiles bp on bp.id = i.business_id
  where pa.id = p_attempt_id
    and pa.mode = 'live'
    and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  for update of pa, i, bp;
  if not found then
    raise exception 'attempt_unavailable' using errcode = 'P0002';
  end if;

  select pa.* into v_attempt from public.payment_attempts pa where pa.id = p_attempt_id;
  select i.* into v_invoice from public.invoices i where i.id = v_attempt.invoice_id;
  select bp.* into v_business from public.business_profiles bp where bp.id = v_invoice.business_id;

  if v_invoice.status not in ('open','overdue') then
    raise exception 'invoice_unavailable' using errcode = 'P0002';
  end if;
  if v_attempt.circle_execution_reserved_at is not null then
    raise exception 'circle_execution_already_reserved' using errcode = '22023';
  end if;
  if v_attempt.status is distinct from 'PENDING_DEPOSIT'
    or v_attempt.circle_recovery_state is distinct from 'AWAITING_SOURCE'
    or v_attempt.transaction_hash is not null
    or v_attempt.settlement_resolved_at is not null then
    raise exception 'invalid_execution_start_state' using errcode = '22023';
  end if;
  if v_attempt.quote_expires_at is null
    or v_attempt.quote_expires_at <= statement_timestamp() then
    raise exception 'quote_expired' using errcode = '22023';
  end if;

  v_snapshot := v_attempt.quote_snapshot;
  if v_snapshot is null or jsonb_typeof(v_snapshot) <> 'object'
    or v_snapshot->>'type' is distinct from 'circle_cctp'
    or v_snapshot->>'invoiceId' is distinct from v_attempt.invoice_id::text
    or v_attempt.business_id is distinct from v_invoice.business_id
    or v_business.id is distinct from v_invoice.business_id
    or v_snapshot->>'invoiceAmountMinor' is distinct from v_invoice.amount_minor::text
    or v_snapshot->>'invoiceCurrency' is distinct from v_invoice.currency
    or v_invoice.currency <> 'USD'
    or lower(coalesce(v_snapshot->>'payer', '')) <> lower(p_expected_payer)
    or v_snapshot->>'sourceNetwork' is distinct from v_attempt.source_network
    or v_snapshot->>'sourceAssetId' is distinct from v_attempt.source_asset_id
    or v_snapshot->>'destinationNetwork' is distinct from v_attempt.destination_network
    or v_snapshot->>'destinationAssetId' is distinct from v_attempt.destination_asset_id
    or v_attempt.recipient_address is null
    or v_invoice.payment_receiving_address is null
    or cardinality(v_invoice.payment_networks) = 0
    or not (v_attempt.destination_network = any(v_invoice.payment_networks))
    or lower(coalesce(v_snapshot->>'recipient', '')) <> lower(v_attempt.recipient_address)
    or lower(v_attempt.recipient_address) is distinct from lower(v_invoice.payment_receiving_address)
    or v_snapshot->>'minimumReceived' is distinct from v_attempt.expected_received_amount
    or v_attempt.expected_received_amount is null
    or v_attempt.requested_amount is null
    or v_attempt.source_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    or v_attempt.source_asset_id <> (v_attempt.source_network || ':usdc')
    or v_attempt.destination_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    or v_attempt.destination_network = v_attempt.source_network
    or v_attempt.destination_asset_id <> (v_attempt.destination_network || ':usdc')
    or v_attempt.expected_received_amount !~ '^[1-9][0-9]*$'
    or v_attempt.requested_amount !~ '^[1-9][0-9]*$'
    or v_snapshot->>'quote' is null
    or btrim(v_snapshot->>'quote') = '' then
    raise exception 'attempt_quote_binding_mismatch' using errcode = '22023';
  end if;

  begin
    v_snapshot_expiry := nullif(v_snapshot->>'quoteExpiresAt', '')::timestamptz;
    v_received := nullif(v_snapshot->>'amountReceived', '')::numeric;
    v_total_debit := nullif(v_snapshot->>'totalDebit', '')::numeric;
    v_fee_total := nullif(v_snapshot->>'feeTotal', '')::numeric;
  exception when others then
    raise exception 'attempt_quote_binding_mismatch' using errcode = '22023';
  end;

  if v_snapshot_expiry is distinct from v_attempt.quote_expires_at
    or v_received is null
    or v_total_debit is null
    or v_fee_total is null
    or v_attempt.expected_received_amount is null
    or v_attempt.requested_amount is null
    or v_received * 1000000 <> v_attempt.expected_received_amount::numeric
    or v_total_debit * 1000000 <> v_attempt.requested_amount::numeric
    or v_total_debit - v_received <> v_fee_total
    or v_invoice.amount_minor::numeric * 10000 <> v_attempt.expected_received_amount::numeric then
    raise exception 'attempt_quote_binding_mismatch' using errcode = '22023';
  end if;

  perform set_config('nodus.circle_execution_reserving', 'yes', true);
  return query
  update public.payment_attempts pa
  set circle_execution_reserved_at = statement_timestamp(),
      status = 'PROCESSING',
      circle_recovery_state = 'AWAITING_SOURCE',
      circle_recovery_updated_at = statement_timestamp()
  where pa.id = p_attempt_id
    and pa.circle_execution_reserved_at is null
    and pa.status = 'PENDING_DEPOSIT'
  returning pa.*;
end;
$function$;

-- Remove unused NEAR tables, trigger functions, and invoice metadata.
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
);

grant update (business_name, receiving_address, receiving_network, receiving_networks)
  on public.business_profiles to authenticated;

alter table public.invoices
  add column if not exists payment_networks text[] not null default '{}',
  add column if not exists payment_receiving_address text;

-- Backfill any already-issued invoices before enforcing immutable payment terms.
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

-- The payer-facing context returns the immutable invoice destination, not live merchant settings.
create or replace function public.lookup_shared_payment_context(p_token_hash text)
returns table (
  invoice_id uuid,
  business_id uuid,
  invoice_number text,
  business_name text,
  amount_minor bigint,
  currency text,
  invoice_status public.invoice_status,
  receiving_address text,
  receiving_network text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    i.id,
    i.business_id,
    i.invoice_number,
    bp.business_name,
    i.amount_minor,
    i.currency,
    case
      when i.status = 'open' and i.due_date < current_date then 'overdue'::public.invoice_status
      else i.status
    end,
    coalesce(i.payment_receiving_address, bp.receiving_address),
    coalesce(i.payment_networks[1], bp.receiving_network)
  from public.invoices i
  join public.business_profiles bp on bp.id = i.business_id
  where p_token_hash ~ '^[0-9a-f]{64}$'
    and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  limit 1;
$function$;

create or replace function public.lookup_shared_payment_networks(p_token_hash text)
returns table (
  invoice_id uuid,
  receiving_address text,
  receiving_networks text[]
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    i.id,
    coalesce(i.payment_receiving_address, bp.receiving_address),
    coalesce(nullif(i.payment_networks, '{}'::text[]), bp.receiving_networks)
  from public.invoices i
  join public.business_profiles bp on bp.id = i.business_id
  where p_token_hash ~ '^[0-9a-f]{64}$'
    and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
    and i.status in ('open','overdue')
  limit 1;
$function$;
revoke all on function public.lookup_shared_payment_networks(text) from public;
grant execute on function public.lookup_shared_payment_networks(text) to anon, authenticated;

-- Issued payment destinations cannot be changed after the invoice is opened.
create or replace function public.guard_invoice_changes()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'open') then
      raise exception 'Invoices can only be created as draft or open';
    end if;
    return new;
  end if;

  if old.status <> 'draft'
    and row(new.payment_networks, new.payment_receiving_address)
      is distinct from row(old.payment_networks, old.payment_receiving_address) then
    raise exception 'Invoice payment destination is immutable after issue';
  end if;

  if old.status = 'paid' then
    if current_user <> 'postgres' then
      raise exception 'Paid invoices cannot be changed';
    end if;
    if row(
      new.id,new.business_id,new.invoice_number,new.customer_name,new.customer_email,
      new.description,new.amount_minor,new.currency,new.issue_date,new.due_date,new.status,
      new.created_at,new.updated_at,new.line_items,new.subtotal_minor,new.tax_rate_bps,
      new.discount_minor,new.invoice_footer,new.seller_snapshot,
      new.payment_networks,new.payment_receiving_address
    ) is distinct from row(
      old.id,old.business_id,old.invoice_number,old.customer_name,old.customer_email,
      old.description,old.amount_minor,old.currency,old.issue_date,old.due_date,old.status,
      old.created_at,old.updated_at,old.line_items,old.subtotal_minor,old.tax_rate_bps,
      old.discount_minor,old.invoice_footer,old.seller_snapshot,
      old.payment_networks,old.payment_receiving_address
    ) then
      raise exception 'Paid invoices cannot be changed';
    end if;
    return new;
  end if;

  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'Cancelled invoices cannot be reopened';
  end if;
  if new.status = 'overdue' and (new.due_date is null or new.due_date >= current_date) then
    raise exception 'Only invoices past their due date can be overdue';
  end if;
  if old.status = 'draft' and new.status not in ('draft','open','cancelled') then
    raise exception 'Invalid invoice status transition';
  end if;
  if new.status = 'paid' and (
    current_user <> 'postgres'
    or current_setting('nodus.payment_reconciliation', true) is distinct from 'verified'
  ) then
    raise exception 'Paid status requires verified settlement';
  end if;
  if old.status = 'open' and new.status not in ('open','overdue','cancelled','paid') then
    raise exception 'Invalid invoice status transition';
  end if;
  if old.status = 'overdue' and new.status not in ('overdue','open','cancelled','paid') then
    raise exception 'Invalid invoice status transition';
  end if;
  return new;
end;
$function$;

-- Bind each committed payment attempt to a network and wallet address explicitly selected on the invoice.
create or replace function public.create_committed_payment_attempt(
  p_token_hash text,
  p_idempotency_key uuid,
  p_source_asset_id text,
  p_source_network text,
  p_destination_asset_id text,
  p_destination_network text,
  p_recipient_address text,
  p_requested_amount text,
  p_expected_received_amount text,
  p_deposit_address text,
  p_deposit_memo text,
  p_quote_expires_at timestamp with time zone,
  p_quote_snapshot jsonb
)
returns setof public.payment_attempts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_context record;
  v_invoice public.invoices%rowtype;
begin
  select * into v_context
  from public.lookup_shared_payment_context(p_token_hash);

  if not found or v_context.invoice_status not in ('open','overdue') then
    raise exception 'invoice_unavailable' using errcode = 'P0002';
  end if;

  if p_requested_amount !~ '^[0-9]+$'
    or p_expected_received_amount !~ '^[0-9]+([.][0-9]+)?$'
    or p_quote_snapshot is null
    or p_deposit_address is null then
    raise exception 'invalid_quote_snapshot' using errcode = '22023';
  end if;

  select * into v_invoice
  from public.invoices
  where id = v_context.invoice_id
  for update;

  if not found or v_invoice.status not in ('open','overdue') then
    raise exception 'invoice_unavailable' using errcode = 'P0002';
  end if;

  if p_source_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    or p_destination_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    or p_source_asset_id <> p_source_network || ':usdc'
    or p_destination_asset_id <> p_destination_network || ':usdc'
    or not (p_destination_network = any(v_invoice.payment_networks))
    or p_recipient_address is null
    or lower(p_recipient_address) <> lower(coalesce(v_invoice.payment_receiving_address, '')) then
    raise exception 'invoice_payment_terms_mismatch' using errcode = '22023';
  end if;

  return query
  select pa.*
  from public.payment_attempts pa
  where pa.invoice_id = v_invoice.id
    and pa.idempotency_key = p_idempotency_key
    and pa.status in ('PENDING_DEPOSIT','PROCESSING','KNOWN_DEPOSIT_TX');
  if found then
    return;
  end if;

  update public.payment_attempts pa
  set status = 'QUOTE_EXPIRED',
      circle_recovery_updated_at = statement_timestamp()
  where pa.invoice_id = v_invoice.id
    and pa.mode = 'live'
    and pa.status in ('PENDING_DEPOSIT','MOCK_QUOTE_READY')
    and pa.quote_expires_at is not null
    and pa.quote_expires_at <= statement_timestamp()
    and pa.circle_execution_reserved_at is null
    and pa.transaction_hash is null
    and pa.circle_approval_tx_hash is null
    and pa.settlement_resolved_at is null;

  if exists (
    select 1
    from public.payment_attempts pa
    where pa.invoice_id = v_invoice.id
      and (
        pa.status in ('MOCK_QUOTE_READY','PENDING_DEPOSIT','KNOWN_DEPOSIT_TX','PROCESSING')
        or (pa.mode = 'live' and pa.status = 'SUCCESS')
      )
  ) then
    raise exception 'active_payment_attempt_exists' using errcode = '23505';
  end if;

  return query
  insert into public.payment_attempts (
    invoice_id,business_id,mode,source_asset_id,source_network,
    destination_asset_id,destination_network,recipient_address,idempotency_key,
    requested_amount,expected_received_amount,deposit_address,deposit_memo,
    quote_expires_at,quote_snapshot,status
  ) values (
    v_invoice.id,v_invoice.business_id,'live',p_source_asset_id,p_source_network,
    p_destination_asset_id,p_destination_network,p_recipient_address,p_idempotency_key,
    p_requested_amount,p_expected_received_amount,p_deposit_address,p_deposit_memo,
    p_quote_expires_at,p_quote_snapshot,'PENDING_DEPOSIT'
  )
  returning *;
end;
$function$;

create or replace function public.allocate_invoice_number(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_prefix text;
  v_sequence bigint;
  v_user_id text;
begin
  v_user_id := auth.jwt() ->> 'sub';
  if v_user_id is null or v_user_id = '' then
    raise exception 'Not authorized to allocate invoice number';
  end if;

  update public.business_profiles
  set next_invoice_number = next_invoice_number + 1
  where id = p_business_id
    and owner_user_id = v_user_id
  returning invoice_prefix, next_invoice_number - 1 into v_prefix, v_sequence;

  if v_sequence is null then
    raise exception 'Business profile not found';
  end if;
  return v_prefix || '-' || to_char(current_date, 'YYYY') || '-' || lpad(v_sequence::text, 4, '0');
end;
$function$;

create or replace function public.merchant_nodus_received_by_chain()
returns table(destination_network text, total_base_units text, payment_count bigint)
language sql
stable
set search_path = ''
as $function$
  with eligible_settlements as (
    select distinct on (ps.id)
      ps.id, ps.destination_network, ps.received_amount_base_units
    from public.business_profiles bp
    join public.invoices i on i.business_id = bp.id
    join public.payment_attempts pa on pa.invoice_id = i.id and pa.business_id = bp.id
    join public.payment_settlements ps on ps.invoice_id = i.id
      and ps.business_id = bp.id and ps.payment_attempt_id = pa.id
    where bp.owner_user_id = (auth.jwt() ->> 'sub')
      and i.status = 'paid'
      and pa.mode = 'live'
      and pa.status = 'SUCCESS'
      and ps.provider_status = 'SUCCESS'
      and ps.outcome = 'VERIFIED'
      and ps.destination_network = pa.destination_network
      and ps.destination_asset_id = pa.destination_asset_id
      and ps.destination_asset_id = ps.destination_network || ':usdc'
      and ps.received_asset_decimals = 6
      and ps.received_amount_base_units ~ '^[0-9]+$'
      and ps.received_amount_base_units::numeric > 0
      and ps.destination_network in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    order by ps.id
  )
  select
    eligible.destination_network,
    sum(eligible.received_amount_base_units::numeric)::text,
    count(*)::bigint
  from eligible_settlements eligible
  group by eligible.destination_network
  order by eligible.destination_network;
$function$;

create or replace function public.create_invoice_paid_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_recipient_user_id text;
  v_business_id uuid;
  v_title text;
  v_message text;
  v_amount_text text;
  v_url text;
begin
  begin
    if old.status is distinct from 'paid' and new.status = 'paid' then
      select bp.owner_user_id, bp.id
      into v_recipient_user_id, v_business_id
      from public.business_profiles bp
      where bp.id = new.business_id;

      if v_recipient_user_id is not null then
        if new.amount_minor is not null and new.currency is not null then
          v_amount_text := trim(to_char(new.amount_minor::numeric / 100.0, 'FM999,999,999,990.00')) || ' ' || new.currency;
        else
          v_amount_text := 'amount confirmed';
        end if;
        v_title := 'Payment received for ' || coalesce(new.invoice_number, 'invoice');
        v_message := 'Invoice ' || coalesce(new.invoice_number, '') || ' was paid (' || v_amount_text || ').';
        v_url := '/dashboard/invoices/' || new.id::text;

        insert into public.notifications (
          recipient_user_id,business_id,type,title,message,invoice_id,destination_url
        ) values (
          v_recipient_user_id,v_business_id,'invoice_paid',v_title,v_message,new.id,v_url
        ) on conflict (recipient_user_id, invoice_id, type) do nothing;
      end if;
    end if;
  exception when others then
    raise warning 'create_invoice_paid_notification failed for invoice %: % (%)',
      new.id, sqlerrm, sqlstate;
  end;
  return new;
end;
$function$;

create or replace function public.mark_circle_execution_started(
  p_token_hash text,
  p_attempt_id uuid,
  p_expected_payer text
)
returns setof public.payment_attempts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempt public.payment_attempts%rowtype;
  v_invoice public.invoices%rowtype;
  v_business public.business_profiles%rowtype;
  v_snapshot jsonb;
  v_snapshot_expiry timestamptz;
  v_received numeric;
  v_total_debit numeric;
  v_fee_total numeric;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_expected_payer is null or p_expected_payer !~ '^0x[0-9a-fA-F]{40}$' then
    raise exception 'invalid_execution_reservation_request' using errcode = '22023';
  end if;

  perform 1
  from public.payment_attempts pa
  join public.invoices i on i.id = pa.invoice_id
  join public.business_profiles bp on bp.id = i.business_id
  where pa.id = p_attempt_id
    and pa.mode = 'live'
    and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  for update of pa, i, bp;
  if not found then
    raise exception 'attempt_unavailable' using errcode = 'P0002';
  end if;

  select pa.* into v_attempt from public.payment_attempts pa where pa.id = p_attempt_id;
  select i.* into v_invoice from public.invoices i where i.id = v_attempt.invoice_id;
  select bp.* into v_business from public.business_profiles bp where bp.id = v_invoice.business_id;

  if v_invoice.status not in ('open','overdue') then
    raise exception 'invoice_unavailable' using errcode = 'P0002';
  end if;
  if v_attempt.circle_execution_reserved_at is not null then
    raise exception 'circle_execution_already_reserved' using errcode = '22023';
  end if;
  if v_attempt.status is distinct from 'PENDING_DEPOSIT'
    or v_attempt.circle_recovery_state is distinct from 'AWAITING_SOURCE'
    or v_attempt.transaction_hash is not null
    or v_attempt.settlement_resolved_at is not null then
    raise exception 'invalid_execution_start_state' using errcode = '22023';
  end if;
  if v_attempt.quote_expires_at is null
    or v_attempt.quote_expires_at <= statement_timestamp() then
    raise exception 'quote_expired' using errcode = '22023';
  end if;

  v_snapshot := v_attempt.quote_snapshot;
  if v_snapshot is null or jsonb_typeof(v_snapshot) <> 'object'
    or v_snapshot->>'type' is distinct from 'circle_cctp'
    or v_snapshot->>'invoiceId' is distinct from v_attempt.invoice_id::text
    or v_attempt.business_id is distinct from v_invoice.business_id
    or v_business.id is distinct from v_invoice.business_id
    or v_snapshot->>'invoiceAmountMinor' is distinct from v_invoice.amount_minor::text
    or v_snapshot->>'invoiceCurrency' is distinct from v_invoice.currency
    or v_invoice.currency <> 'USD'
    or lower(coalesce(v_snapshot->>'payer', '')) <> lower(p_expected_payer)
    or v_snapshot->>'sourceNetwork' is distinct from v_attempt.source_network
    or v_snapshot->>'sourceAssetId' is distinct from v_attempt.source_asset_id
    or v_snapshot->>'destinationNetwork' is distinct from v_attempt.destination_network
    or v_snapshot->>'destinationAssetId' is distinct from v_attempt.destination_asset_id
    or v_attempt.recipient_address is null
    or v_invoice.payment_receiving_address is null
    or cardinality(v_invoice.payment_networks) = 0
    or not (v_attempt.destination_network = any(v_invoice.payment_networks))
    or lower(coalesce(v_snapshot->>'recipient', '')) <> lower(v_attempt.recipient_address)
    or lower(v_attempt.recipient_address) is distinct from lower(v_invoice.payment_receiving_address)
    or v_snapshot->>'minimumReceived' is distinct from v_attempt.expected_received_amount
    or v_attempt.expected_received_amount is null
    or v_attempt.requested_amount is null
    or v_attempt.source_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    or v_attempt.source_asset_id <> (v_attempt.source_network || ':usdc')
    or v_attempt.destination_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    or v_attempt.destination_network = v_attempt.source_network
    or v_attempt.destination_asset_id <> (v_attempt.destination_network || ':usdc')
    or v_attempt.expected_received_amount !~ '^[1-9][0-9]*$'
    or v_attempt.requested_amount !~ '^[1-9][0-9]*$'
    or v_snapshot->>'quote' is null
    or btrim(v_snapshot->>'quote') = '' then
    raise exception 'attempt_quote_binding_mismatch' using errcode = '22023';
  end if;

  begin
    v_snapshot_expiry := nullif(v_snapshot->>'quoteExpiresAt', '')::timestamptz;
    v_received := nullif(v_snapshot->>'amountReceived', '')::numeric;
    v_total_debit := nullif(v_snapshot->>'totalDebit', '')::numeric;
    v_fee_total := nullif(v_snapshot->>'feeTotal', '')::numeric;
  exception when others then
    raise exception 'attempt_quote_binding_mismatch' using errcode = '22023';
  end;

  if v_snapshot_expiry is distinct from v_attempt.quote_expires_at
    or v_received is null
    or v_total_debit is null
    or v_fee_total is null
    or v_attempt.expected_received_amount is null
    or v_attempt.requested_amount is null
    or v_received * 1000000 <> v_attempt.expected_received_amount::numeric
    or v_total_debit * 1000000 <> v_attempt.requested_amount::numeric
    or v_total_debit - v_received <> v_fee_total
    or v_invoice.amount_minor::numeric * 10000 <> v_attempt.expected_received_amount::numeric then
    raise exception 'attempt_quote_binding_mismatch' using errcode = '22023';
  end if;

  perform set_config('nodus.circle_execution_reserving', 'yes', true);
  return query
  update public.payment_attempts pa
  set circle_execution_reserved_at = statement_timestamp(),
      status = 'PROCESSING',
      circle_recovery_state = 'AWAITING_SOURCE',
      circle_recovery_updated_at = statement_timestamp()
  where pa.id = p_attempt_id
    and pa.circle_execution_reserved_at is null
    and pa.status = 'PENDING_DEPOSIT'
  returning pa.*;
end;
$function$;

-- Remove unused NEAR tables, trigger functions, and invoice metadata.
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
