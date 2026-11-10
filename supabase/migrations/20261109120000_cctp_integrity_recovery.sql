-- Additive hardening for Circle CCTP attempts. Existing invoice, settlement,
-- receipt and attempt rows are retained.

alter table public.payment_attempts
  add column circle_recovery_state text not null default 'AWAITING_SOURCE',
  add column circle_approval_tx_hash text,
  add column circle_message_nonce text,
  add column circle_message_hash text,
  add column circle_destination_tx_hashes jsonb not null default '[]'::jsonb,
  add column circle_recovery_updated_at timestamptz not null default statement_timestamp(),
  add constraint payment_attempts_circle_recovery_state_check check (circle_recovery_state in (
    'AWAITING_SOURCE', 'SOURCE_CANDIDATE', 'SOURCE_VERIFIED', 'AWAITING_IRIS',
    'AWAITING_DESTINATION', 'DESTINATION_VERIFIED', 'AWAITING_FINALITY', 'AWAITING_VERIFICATION',
    'MANUAL_REVIEW', 'SETTLED'
  )),
  add constraint payment_attempts_circle_approval_hash_check check (
    circle_approval_tx_hash is null or circle_approval_tx_hash ~ '^0x[0-9a-fA-F]{64}$'
  ),
  add constraint payment_attempts_circle_message_nonce_check check (
    circle_message_nonce is null or circle_message_nonce ~ '^0x[0-9a-fA-F]{64}$'
  ),
  add constraint payment_attempts_circle_message_hash_check check (
    circle_message_hash is null or circle_message_hash ~ '^0x[0-9a-fA-F]{64}$'
  ),
  add constraint payment_attempts_circle_destination_hashes_check check (
    jsonb_typeof(circle_destination_tx_hashes) = 'array'
    and jsonb_array_length(circle_destination_tx_hashes) <= 2
  );

create function public.guard_live_attempt_terms()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.mode = 'live' and old.transaction_hash is not null
    and lower(new.transaction_hash) is distinct from lower(old.transaction_hash) then
    raise exception 'source_burn_reference_is_immutable' using errcode = '22023';
  end if;
  if old.mode = 'live' and old.circle_approval_tx_hash is not null
    and lower(new.circle_approval_tx_hash) is distinct from lower(old.circle_approval_tx_hash) then
    raise exception 'approval_reference_is_immutable' using errcode = '22023';
  end if;
  if old.mode = 'live' and row(new.invoice_id, new.business_id, new.source_asset_id,
      new.source_network, new.destination_asset_id, new.destination_network,
      new.recipient_address, new.idempotency_key, new.requested_amount,
      new.expected_received_amount, new.deposit_address, new.deposit_memo,
      new.quote_expires_at, new.quote_snapshot)
    is distinct from
    row(old.invoice_id, old.business_id, old.source_asset_id,
      old.source_network, old.destination_asset_id, old.destination_network,
      old.recipient_address, old.idempotency_key, old.requested_amount,
      old.expected_received_amount, old.deposit_address, old.deposit_memo,
      old.quote_expires_at, old.quote_snapshot) then
    raise exception 'live_payment_terms_are_immutable' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger payment_attempts_guard_live_terms
  before update on public.payment_attempts
  for each row execute function public.guard_live_attempt_terms();

-- Invoice amount/currency edits must not change a live quote underneath a payer.
create function public.guard_invoice_terms_with_active_attempt()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.amount_minor, new.currency, new.business_id) is distinct from
      row(old.amount_minor, old.currency, old.business_id)
    and (exists (select 1 from public.payment_attempts pa where pa.invoice_id = old.id
        and pa.mode = 'live' and pa.status in ('PENDING_DEPOSIT','KNOWN_DEPOSIT_TX','PROCESSING'))
      or exists (select 1 from public.payment_settlements ps where ps.invoice_id = old.id)) then
    raise exception 'invoice_terms_locked_by_live_payment_attempt' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger invoices_guard_live_payment_terms
  before update on public.invoices
  for each row execute function public.guard_invoice_terms_with_active_attempt();

-- Keep the same destination transaction from being assigned to multiple
-- settlements/invoices, including a multi-transaction forwarding execution.
create table public.payment_settlement_transactions (
  destination_network text not null,
  transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
  payment_settlement_id uuid not null references public.payment_settlements(id) on delete restrict,
  primary key (destination_network, transaction_hash),
  unique (payment_settlement_id, destination_network, transaction_hash)
);
alter table public.payment_settlement_transactions enable row level security;
revoke all on public.payment_settlement_transactions from public, anon, authenticated;

do $$
begin
  if exists (
    select lower(item.value #>> '{}') as hash, ps.destination_network
    from public.payment_settlements ps
    cross join lateral jsonb_array_elements(ps.destination_tx_hashes) item(value)
    where ps.destination_network is not null
      and item.value #>> '{}' ~ '^0x[0-9a-fA-F]{64}$'
    group by lower(item.value #>> '{}'), ps.destination_network
    having count(distinct ps.id) > 1
  ) then
    raise exception 'duplicate_legacy_destination_transactions_require_manual_reconciliation';
  end if;
end;
$$;

insert into public.payment_settlement_transactions(destination_network, transaction_hash, payment_settlement_id)
select distinct on (ps.destination_network, lower(item.value #>> '{}'))
  ps.destination_network, lower(item.value #>> '{}'), ps.id
from public.payment_settlements ps
cross join lateral jsonb_array_elements(ps.destination_tx_hashes) item(value)
where ps.destination_network is not null
  and item.value #>> '{}' ~ '^0x[0-9a-fA-F]{64}$'
order by ps.destination_network, lower(item.value #>> '{}'), ps.created_at, ps.id;

create function public.index_settlement_transaction_references()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  if new.outcome not in ('VERIFIED','PARTIAL','OVERPAID','REVIEW_REQUIRED') then return new; end if;
  if new.destination_network is null then raise exception 'settlement_destination_network_required'; end if;
  for v_hash in select lower(item.value #>> '{}')
    from jsonb_array_elements(new.destination_tx_hashes) item(value)
  loop
    if v_hash !~ '^0x[0-9a-f]{64}$' then raise exception 'invalid_settlement_transaction_hash'; end if;
    insert into public.payment_settlement_transactions(destination_network, transaction_hash, payment_settlement_id)
      values (new.destination_network, v_hash, new.id);
  end loop;
  return new;
end;
$$;
create trigger payment_settlements_index_transactions
  after insert on public.payment_settlements
  for each row execute function public.index_settlement_transaction_references();

create function public.submit_circle_broadcast_references(
  p_token_hash text, p_attempt_id uuid, p_source_tx_hash text, p_approval_tx_hash text default null
) returns setof public.payment_attempts
language plpgsql security definer set search_path = '' as $$
declare v_attempt public.payment_attempts%rowtype;
begin
  select pa.* into v_attempt from public.payment_attempts pa
  join public.invoices i on i.id = pa.invoice_id
  where pa.id = p_attempt_id and pa.mode = 'live'
    and i.share_token_hash = p_token_hash and i.share_token_expires_at > statement_timestamp()
  for update of pa;
  if not found then raise exception 'attempt_unavailable' using errcode = 'P0002'; end if;
  if p_source_tx_hash !~ '^0x[0-9a-fA-F]{64}$'
    or (p_approval_tx_hash is not null and p_approval_tx_hash !~ '^0x[0-9a-fA-F]{64}$') then
    raise exception 'invalid_broadcast_reference' using errcode = '22023';
  end if;
  if v_attempt.transaction_hash is not null and lower(v_attempt.transaction_hash) <> lower(p_source_tx_hash) then
    raise exception 'source_burn_reference_already_recorded' using errcode = '22023';
  end if;
  if v_attempt.circle_approval_tx_hash is not null and p_approval_tx_hash is not null
    and lower(v_attempt.circle_approval_tx_hash) <> lower(p_approval_tx_hash) then
    raise exception 'approval_reference_already_recorded' using errcode = '22023';
  end if;
  return query update public.payment_attempts set
    transaction_hash = coalesce(transaction_hash, p_source_tx_hash),
    circle_approval_tx_hash = coalesce(circle_approval_tx_hash, p_approval_tx_hash),
    circle_recovery_state = 'SOURCE_CANDIDATE',
    circle_recovery_updated_at = statement_timestamp(),
    status = 'KNOWN_DEPOSIT_TX'
  where id = p_attempt_id returning *;
end;
$$;

create function public.mark_circle_execution_started(p_token_hash text, p_attempt_id uuid)
returns setof public.payment_attempts
language plpgsql security definer set search_path = '' as $$
declare v_attempt public.payment_attempts%rowtype;
begin
  select pa.* into v_attempt from public.payment_attempts pa
  join public.invoices i on i.id = pa.invoice_id
  where pa.id = p_attempt_id and pa.mode = 'live'
    and i.share_token_hash = p_token_hash and i.share_token_expires_at > statement_timestamp()
  for update of pa;
  if not found then raise exception 'attempt_unavailable' using errcode = 'P0002'; end if;
  if v_attempt.transaction_hash is not null then
    raise exception 'source_burn_reference_already_recorded' using errcode = '22023';
  end if;
  if v_attempt.quote_expires_at is null or v_attempt.quote_expires_at <= statement_timestamp() then
    raise exception 'quote_expired' using errcode = '22023';
  end if;
  if v_attempt.status not in ('PENDING_DEPOSIT','PROCESSING') then
    raise exception 'invalid_execution_start_state' using errcode = '22023';
  end if;
  return query update public.payment_attempts set status = 'PROCESSING',
    circle_recovery_state = 'AWAITING_SOURCE',
    circle_recovery_updated_at = statement_timestamp()
  where id = p_attempt_id returning *;
end;
$$;

create function public.record_circle_recovery_progress(
  p_attempt_id uuid, p_state text, p_message_nonce text default null,
  p_message_hash text default null, p_destination_tx_hashes jsonb default '[]'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_state not in ('AWAITING_SOURCE','SOURCE_CANDIDATE','SOURCE_VERIFIED','AWAITING_IRIS',
    'AWAITING_DESTINATION','DESTINATION_VERIFIED','AWAITING_FINALITY','AWAITING_VERIFICATION','MANUAL_REVIEW','SETTLED')
    or p_destination_tx_hashes is null or jsonb_typeof(p_destination_tx_hashes) <> 'array'
    or jsonb_array_length(p_destination_tx_hashes) > 2
    or exists (select 1 from jsonb_array_elements_text(p_destination_tx_hashes) item(value)
      where item.value !~ '^0x[0-9a-fA-F]{64}$')
    or (p_message_nonce is not null and p_message_nonce !~ '^0x[0-9a-fA-F]{64}$')
    or (p_message_hash is not null and p_message_hash !~ '^0x[0-9a-fA-F]{64}$') then
    raise exception 'invalid_circle_recovery_progress' using errcode = '22023';
  end if;
  if exists (select 1 from public.payment_attempts pa where pa.id = p_attempt_id and pa.mode = 'live'
      and ((pa.circle_message_nonce is not null and p_message_nonce is not null
          and lower(pa.circle_message_nonce) <> lower(p_message_nonce))
        or (pa.circle_message_hash is not null and p_message_hash is not null
          and lower(pa.circle_message_hash) <> lower(p_message_hash)))) then
    raise exception 'circle_message_binding_is_immutable' using errcode = '22023';
  end if;
  update public.payment_attempts set
    circle_recovery_state = p_state,
    circle_message_nonce = coalesce(circle_message_nonce, p_message_nonce),
    circle_message_hash = coalesce(circle_message_hash, p_message_hash),
    circle_destination_tx_hashes = case when jsonb_array_length(p_destination_tx_hashes) > 0
      then p_destination_tx_hashes else circle_destination_tx_hashes end,
    circle_recovery_updated_at = statement_timestamp()
  where id = p_attempt_id and mode = 'live';
  if not found then raise exception 'live_attempt_unavailable' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function public.submit_circle_broadcast_references(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.mark_circle_execution_started(text, uuid) from public, anon, authenticated;
revoke all on function public.record_circle_recovery_progress(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_circle_broadcast_references(text, uuid, text, text) to service_role;
grant execute on function public.mark_circle_execution_started(text, uuid) to service_role;
grant execute on function public.record_circle_recovery_progress(uuid, text, text, text, jsonb) to service_role;
