-- Phase 6: verified settlement records and owner/customer-safe receipts.
-- This migration is intentionally not applied automatically by the application.

create type public.payment_settlement_outcome as enum (
  'VERIFIED', 'PARTIAL', 'OVERPAID', 'REVIEW_REQUIRED',
  'REFUNDED', 'FAILED', 'INCOMPLETE_DEPOSIT', 'EXPIRED'
);

alter table public.payment_attempts
  add column settlement_resolved_at timestamptz;

drop index public.payment_attempts_one_active_per_invoice;
create unique index payment_attempts_one_active_per_invoice
  on public.payment_attempts(invoice_id)
  where status in ('MOCK_QUOTE_READY', 'PENDING_DEPOSIT', 'KNOWN_DEPOSIT_TX', 'PROCESSING')
    or (mode = 'live' and status = 'SUCCESS' and settlement_resolved_at is null);

-- Serialize quote creation per invoice and permit a follow-on attempt only after
-- a verified partial payment has been resolved. Unsettled SUCCESS stays active.
create or replace function public.create_committed_payment_attempt(
  p_token_hash text, p_idempotency_key uuid, p_source_asset_id text, p_source_network text,
  p_destination_asset_id text, p_destination_network text, p_recipient_address text,
  p_requested_amount text, p_expected_received_amount text, p_deposit_address text,
  p_deposit_memo text, p_quote_expires_at timestamptz, p_quote_snapshot jsonb
) returns setof public.payment_attempts
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice_id uuid;
  v_context record;
begin
  select i.id into v_invoice_id from public.invoices i
    where p_token_hash ~ '^[0-9a-f]{64}$' and i.share_token_hash = p_token_hash
      and i.share_token_expires_at > statement_timestamp()
    for update;
  if not found then raise exception 'invoice_unavailable' using errcode = 'P0002'; end if;
  select * into v_context from public.lookup_shared_payment_context(p_token_hash);
  if not found or v_context.invoice_id <> v_invoice_id or v_context.invoice_status not in ('open','overdue') then
    raise exception 'invoice_unavailable' using errcode = 'P0002';
  end if;
  if p_requested_amount is null or p_requested_amount !~ '^[0-9]+$'
    or p_expected_received_amount is null or p_expected_received_amount !~ '^[0-9]+$'
    or p_source_asset_id is null or p_source_network is null
    or p_destination_asset_id is null or p_destination_network is null
    or p_recipient_address is null
    or p_quote_snapshot is null or jsonb_typeof(p_quote_snapshot) <> 'object'
    or p_deposit_address is null or p_quote_expires_at <= statement_timestamp() then
    raise exception 'invalid_quote_snapshot' using errcode = '22023';
  end if;
  if exists (select 1 from public.payment_attempts pa where pa.invoice_id = v_invoice_id
      and (pa.status in ('MOCK_QUOTE_READY','PENDING_DEPOSIT','KNOWN_DEPOSIT_TX','PROCESSING')
        or (pa.mode = 'live' and pa.status = 'SUCCESS' and pa.settlement_resolved_at is null))) then
    raise exception 'active_payment_attempt_exists' using errcode = '23505';
  end if;
  return query insert into public.payment_attempts (
    invoice_id, business_id, mode, source_asset_id, source_network,
    destination_asset_id, destination_network, recipient_address, idempotency_key,
    requested_amount, expected_received_amount, deposit_address, deposit_memo,
    quote_expires_at, quote_snapshot, status
  ) values (v_invoice_id, v_context.business_id, 'live', p_source_asset_id,
    p_source_network, p_destination_asset_id, p_destination_network, p_recipient_address,
    p_idempotency_key, p_requested_amount, p_expected_received_amount, p_deposit_address,
    p_deposit_memo, p_quote_expires_at, p_quote_snapshot, 'PENDING_DEPOSIT')
  returning *;
end;
$$;

create table public.payment_settlements (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null unique references public.payment_attempts(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  business_id uuid not null references public.business_profiles(id) on delete restrict,
  provider_status public.payment_attempt_status not null,
  outcome public.payment_settlement_outcome not null,
  destination_asset_id text,
  destination_network text,
  recipient_address text,
  received_amount_base_units text check (received_amount_base_units is null or received_amount_base_units ~ '^[0-9]+$'),
  received_asset_decimals smallint check (received_asset_decimals is null or received_asset_decimals between 0 and 30),
  received_value_invoice_minor numeric(78, 30) check (received_value_invoice_minor is null or received_value_invoice_minor >= 0),
  destination_tx_hashes jsonb not null default '[]'::jsonb check (jsonb_typeof(destination_tx_hashes) = 'array'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object' and pg_column_size(evidence) <= 65536),
  created_at timestamptz not null default now(),
  constraint payment_settlement_invoice_business_fk foreign key (invoice_id, business_id)
    references public.invoices(id, business_id) deferrable initially immediate,
  constraint payment_settlement_outcome_provider_check check (
    (outcome = 'VERIFIED' and provider_status = 'SUCCESS')
    or (outcome = 'PARTIAL' and provider_status = 'SUCCESS')
    or (outcome = 'OVERPAID' and provider_status = 'SUCCESS')
    or (outcome = 'REVIEW_REQUIRED' and provider_status = 'SUCCESS')
    or (outcome = 'REFUNDED' and provider_status = 'REFUNDED')
    or (outcome = 'FAILED' and provider_status = 'FAILED')
    or (outcome = 'INCOMPLETE_DEPOSIT' and provider_status = 'INCOMPLETE_DEPOSIT')
    or (outcome = 'EXPIRED' and provider_status = 'PENDING_DEPOSIT')
  ),
  constraint payment_settlement_verified_fields_check check (
    outcome not in ('VERIFIED', 'PARTIAL', 'OVERPAID', 'REVIEW_REQUIRED')
    or (destination_asset_id is not null and destination_network is not null
      and recipient_address is not null and received_amount_base_units is not null
      and received_asset_decimals is not null and received_value_invoice_minor is not null
      and jsonb_array_length(destination_tx_hashes) > 0)
  )
);

create index payment_settlements_invoice_created_idx
  on public.payment_settlements(invoice_id, created_at desc);

create table public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_settlement_id uuid not null unique references public.payment_settlements(id) on delete restrict,
  payment_attempt_id uuid not null unique references public.payment_attempts(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  business_id uuid not null references public.business_profiles(id) on delete restrict,
  receipt_number text not null unique,
  issued_at timestamptz not null default now(),
  constraint payment_receipt_invoice_business_fk foreign key (invoice_id, business_id)
    references public.invoices(id, business_id) deferrable initially immediate
);

create index payment_receipts_invoice_issued_idx
  on public.payment_receipts(invoice_id, issued_at desc);

alter table public.payment_settlements enable row level security;
alter table public.payment_receipts enable row level security;

create policy "Business owners can view payment settlements" on public.payment_settlements
for select to authenticated using (
  exists (select 1 from public.business_profiles bp
    where bp.id = business_id and bp.owner_user_id = (select auth.uid()))
);
create policy "Business owners can view payment receipts" on public.payment_receipts
for select to authenticated using (
  exists (select 1 from public.business_profiles bp
    where bp.id = business_id and bp.owner_user_id = (select auth.uid()))
);

revoke all on public.payment_settlements from public, anon, authenticated;
revoke all on public.payment_receipts from public, anon, authenticated;
grant select on public.payment_settlements to authenticated;
grant select on public.payment_receipts to authenticated;

create sequence public.payment_receipt_number_seq;
revoke all on sequence public.payment_receipt_number_seq from public, anon, authenticated;

-- Only the privileged reconciliation function runs as postgres and can use this
-- guarded path. Authenticated/service-role table updates still cannot set invoices paid.
create or replace function public.guard_invoice_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'open') then
      raise exception 'Invoices can only be created as draft or open';
    end if;
    return new;
  end if;

  if old.status = 'paid' then
    if current_user <> 'postgres' then
      raise exception 'Paid invoices cannot be changed';
    end if;
    if row(new.id, new.business_id, new.invoice_number, new.customer_name,
        new.customer_email, new.description, new.amount_minor, new.currency,
        new.issue_date, new.due_date, new.status, new.created_at, new.updated_at)
       is distinct from
       row(old.id, old.business_id, old.invoice_number, old.customer_name,
        old.customer_email, old.description, old.amount_minor, old.currency,
        old.issue_date, old.due_date, old.status, old.created_at, old.updated_at) then
      raise exception 'Paid invoices cannot be changed';
    end if;
    return new;
  end if;

  if new.status = 'paid' and (current_user <> 'postgres'
    or current_setting('nodus.payment_reconciliation', true) <> 'verified') then
    raise exception 'Paid status requires verified settlement';
  end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'Cancelled invoices cannot be reopened';
  end if;
  if new.status = 'overdue' and (new.due_date is null or new.due_date >= current_date) then
    raise exception 'Only invoices past their due date can be overdue';
  end if;
  if old.status = 'draft' and new.status not in ('draft', 'open', 'cancelled') then
    raise exception 'Invalid invoice status transition';
  end if;
  if old.status = 'open' and new.status not in ('open', 'overdue', 'cancelled', 'paid') then
    raise exception 'Invalid invoice status transition';
  end if;
  if old.status = 'overdue' and new.status not in ('overdue', 'open', 'cancelled', 'paid') then
    raise exception 'Invalid invoice status transition';
  end if;
  return new;
end;
$$;

create function public.record_payment_reconciliation(
  p_attempt_id uuid,
  p_provider_status public.payment_attempt_status,
  p_provider_signature_verified boolean,
  p_chain_transfer_verified boolean default false,
  p_destination_asset_id text default null,
  p_destination_network text default null,
  p_recipient_address text default null,
  p_received_amount_base_units text default null,
  p_received_asset_decimals integer default null,
  p_received_value_invoice_minor text default null,
  p_destination_tx_hashes jsonb default '[]'::jsonb,
  p_evidence jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.payment_attempts%rowtype;
  v_invoice public.invoices%rowtype;
  v_existing public.payment_settlements%rowtype;
  v_receipt_number text;
  v_settlement_id uuid;
  v_outcome public.payment_settlement_outcome;
  v_total numeric(78, 30);
  v_received numeric(78, 30);
  v_invoice_status public.invoice_status;
begin
  select pa.* into v_attempt from public.payment_attempts pa
    where pa.id = p_attempt_id and pa.mode = 'live'
    for update;
  if not found then raise exception 'live_attempt_unavailable' using errcode = 'P0002'; end if;

  select * into v_existing from public.payment_settlements ps
    where ps.payment_attempt_id = p_attempt_id;
  if found then
    select pr.receipt_number into v_receipt_number from public.payment_receipts pr
      where pr.payment_settlement_id = v_existing.id;
    select i.status into v_invoice_status from public.invoices i where i.id = v_attempt.invoice_id;
    return jsonb_build_object(
      'settlementId', v_existing.id, 'outcome', v_existing.outcome,
      'receiptNumber', v_receipt_number, 'invoiceStatus', v_invoice_status, 'idempotent', true
    );
  end if;

  select i.* into v_invoice from public.invoices i
    where i.id = v_attempt.invoice_id and i.business_id = v_attempt.business_id
    for update;
  if not found then raise exception 'attempt_invoice_business_mismatch' using errcode = '23503'; end if;
  if not p_provider_signature_verified then
    raise exception 'provider_signature_unverified' using errcode = '22023';
  end if;
  if p_destination_tx_hashes is null or jsonb_typeof(p_destination_tx_hashes) <> 'array'
    or jsonb_array_length(p_destination_tx_hashes) > 16
    or p_evidence is null or jsonb_typeof(p_evidence) <> 'object'
    or pg_column_size(p_evidence) > 65536 then
    raise exception 'invalid_verification_evidence' using errcode = '22023';
  end if;

  if p_provider_status in ('PENDING_DEPOSIT', 'KNOWN_DEPOSIT_TX', 'PROCESSING') then
    if p_provider_status = 'PENDING_DEPOSIT' and v_attempt.transaction_hash is null
      and v_attempt.quote_expires_at is not null and v_attempt.quote_expires_at <= statement_timestamp() then
      v_outcome := 'EXPIRED';
      update public.payment_attempts set status = 'QUOTE_EXPIRED', settlement_resolved_at = statement_timestamp()
        where id = p_attempt_id;
    else
      update public.payment_attempts set status = p_provider_status
        where id = p_attempt_id and settlement_resolved_at is null;
      return jsonb_build_object('outcome', 'PROCESSING', 'providerStatus', p_provider_status, 'invoiceStatus', v_invoice.status, 'idempotent', false);
    end if;
  elsif p_provider_status in ('FAILED', 'REFUNDED', 'INCOMPLETE_DEPOSIT') then
    v_outcome := p_provider_status::text::public.payment_settlement_outcome;
    update public.payment_attempts set status = p_provider_status, settlement_resolved_at = statement_timestamp()
      where id = p_attempt_id;
  elsif p_provider_status = 'SUCCESS' then
    if not p_chain_transfer_verified
      or p_destination_asset_id is distinct from v_attempt.destination_asset_id
      or p_destination_network is distinct from v_attempt.destination_network
      or p_recipient_address is distinct from v_attempt.recipient_address
      or p_received_amount_base_units is null or p_received_amount_base_units !~ '^[0-9]+$'
      or p_received_asset_decimals is null or p_received_asset_decimals not between 0 and 30
      or p_received_value_invoice_minor is null or p_received_value_invoice_minor !~ '^[0-9]+([.][0-9]+)?$'
      or jsonb_array_length(p_destination_tx_hashes) = 0 then
      raise exception 'settlement_proof_mismatch' using errcode = '22023';
    end if;
    if p_received_value_invoice_minor::numeric is distinct from
      (p_received_amount_base_units::numeric * 100 / power(10::numeric, p_received_asset_decimals)) then
      raise exception 'settlement_value_mismatch' using errcode = '22023';
    end if;
    if v_attempt.status in ('FAILED', 'REFUNDED', 'INCOMPLETE_DEPOSIT', 'QUOTE_EXPIRED') then
      raise exception 'invalid_terminal_attempt_transition' using errcode = '22023';
    end if;

    v_received := p_received_value_invoice_minor::numeric;
    select coalesce(sum(ps.received_value_invoice_minor), 0) into v_total
      from public.payment_settlements ps
      where ps.invoice_id = v_invoice.id and ps.outcome in ('PARTIAL', 'VERIFIED');
    v_total := v_total + v_received;

    if v_invoice.status not in ('open', 'overdue') then
      v_outcome := 'REVIEW_REQUIRED';
    elsif v_total = v_invoice.amount_minor then
      v_outcome := 'VERIFIED';
      perform set_config('nodus.payment_reconciliation', 'verified', true);
      update public.invoices set status = 'paid' where id = v_invoice.id and status in ('open', 'overdue');
      perform set_config('nodus.payment_reconciliation', '', true);
    elsif v_total < v_invoice.amount_minor then
      v_outcome := 'PARTIAL';
    else
      v_outcome := 'OVERPAID';
    end if;

    update public.payment_attempts set status = 'SUCCESS',
      settlement_resolved_at = case when v_outcome in ('VERIFIED', 'PARTIAL') then statement_timestamp() else null end
      where id = p_attempt_id;
  else
    raise exception 'unsupported_provider_status' using errcode = '22023';
  end if;

  insert into public.payment_settlements (
    payment_attempt_id, invoice_id, business_id, provider_status, outcome,
    destination_asset_id, destination_network, recipient_address,
    received_amount_base_units, received_asset_decimals, received_value_invoice_minor,
    destination_tx_hashes, evidence
  ) values (
    p_attempt_id, v_invoice.id, v_invoice.business_id, p_provider_status, v_outcome,
    case when p_provider_status = 'SUCCESS' then p_destination_asset_id end,
    case when p_provider_status = 'SUCCESS' then p_destination_network end,
    case when p_provider_status = 'SUCCESS' then p_recipient_address end,
    case when p_provider_status = 'SUCCESS' then p_received_amount_base_units end,
    case when p_provider_status = 'SUCCESS' then p_received_asset_decimals::smallint end,
    case when p_provider_status = 'SUCCESS' then v_received end,
    case when p_provider_status = 'SUCCESS' then p_destination_tx_hashes else '[]'::jsonb end,
    p_evidence
  ) returning id into v_settlement_id;

  if v_outcome in ('VERIFIED', 'PARTIAL', 'OVERPAID', 'REVIEW_REQUIRED') then
    v_receipt_number := 'NOD-' || to_char(statement_timestamp() at time zone 'UTC', 'YYYY') || '-'
      || lpad(nextval('public.payment_receipt_number_seq')::text, 8, '0');
    insert into public.payment_receipts (
      payment_settlement_id, payment_attempt_id, invoice_id, business_id, receipt_number
    ) values (v_settlement_id, p_attempt_id, v_invoice.id, v_invoice.business_id, v_receipt_number);
  end if;

  select i.status into v_invoice_status from public.invoices i where i.id = v_invoice.id;
  return jsonb_build_object(
    'settlementId', v_settlement_id, 'outcome', v_outcome,
    'receiptNumber', v_receipt_number, 'invoiceStatus', v_invoice_status, 'idempotent', false
  );
end;
$$;

create function public.lookup_shared_payment_receipts(p_token_hash text)
returns table (
  receipt_number text,
  invoice_number text,
  business_name text,
  outcome public.payment_settlement_outcome,
  destination_asset_id text,
  destination_network text,
  received_amount_base_units text,
  received_asset_decimals smallint,
  destination_tx_hashes jsonb,
  issued_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select pr.receipt_number, i.invoice_number, bp.business_name, ps.outcome,
    ps.destination_asset_id, ps.destination_network, ps.received_amount_base_units,
    ps.received_asset_decimals, ps.destination_tx_hashes, pr.issued_at
  from public.payment_receipts pr
  join public.payment_settlements ps on ps.id = pr.payment_settlement_id
  join public.invoices i on i.id = pr.invoice_id and i.business_id = pr.business_id
  join public.business_profiles bp on bp.id = pr.business_id
  where p_token_hash ~ '^[0-9a-f]{64}$'
    and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  order by pr.issued_at desc;
$$;

revoke all on function public.record_payment_reconciliation(uuid, public.payment_attempt_status, boolean, boolean, text, text, text, text, integer, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.lookup_shared_payment_receipts(text) from public, authenticated;
grant execute on function public.record_payment_reconciliation(uuid, public.payment_attempt_status, boolean, boolean, text, text, text, text, integer, text, jsonb, jsonb) to service_role;
grant execute on function public.lookup_shared_payment_receipts(text) to anon;
