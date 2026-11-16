-- Migration: 20261111100000_fix_abandoned_attempts_and_reservations.sql
-- NODUS STAGE 2.3.3-A BACKEND REMEDIATION
-- 1. Atomic expiration of abandoned unreserved payment attempts before new attempt creation.
-- 2. Concurrency-safe invoice row locking during attempt creation.
-- 3. Strict protection of execution reservations: never expire or release reserved/broadcast attempts.
-- 4. Permit QUOTE_EXPIRED status updates only on unreserved, unbroadcast, expired attempts.

create or replace function public.expire_abandoned_payment_attempts(p_token_hash text)
returns setof public.payment_attempts
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice_id uuid;
begin
  select i.id into v_invoice_id
  from public.invoices i
  where p_token_hash ~ '^[0-9a-f]{64}$'
    and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  for update;
  if not found then return; end if;

  return query update public.payment_attempts pa
  set status = 'QUOTE_EXPIRED',
      circle_recovery_updated_at = statement_timestamp()
  where pa.invoice_id = v_invoice_id
    and pa.mode = 'live'
    and pa.status in ('PENDING_DEPOSIT', 'MOCK_QUOTE_READY')
    and pa.quote_expires_at is not null
    and pa.quote_expires_at <= statement_timestamp()
    and pa.circle_execution_reserved_at is null
    and pa.transaction_hash is null
    and pa.circle_approval_tx_hash is null
    and pa.settlement_resolved_at is null
  returning pa.*;
end;
$$;

create or replace function public.create_committed_payment_attempt(
  p_token_hash text, p_idempotency_key uuid, p_source_asset_id text, p_source_network text,
  p_destination_asset_id text, p_destination_network text, p_recipient_address text,
  p_requested_amount text, p_expected_received_amount text, p_deposit_address text,
  p_deposit_memo text, p_quote_expires_at timestamptz, p_quote_snapshot jsonb
) returns setof public.payment_attempts
language plpgsql security definer set search_path = '' as $$
declare
  v_context record;
  v_invoice public.invoices%rowtype;
begin
  select * into v_context from public.lookup_shared_payment_context(p_token_hash);
  if not found or v_context.invoice_status not in ('open','overdue') then
    raise exception 'invoice_unavailable' using errcode = 'P0002';
  end if;
  if p_requested_amount !~ '^[0-9]+$' or p_expected_received_amount !~ '^[0-9]+([.][0-9]+)?$'
    or p_quote_snapshot is null or p_deposit_address is null then
    raise exception 'invalid_quote_snapshot' using errcode = '22023';
  end if;

  -- Lock invoice row to serialize concurrent attempt creation and state transitions
  select * into v_invoice
  from public.invoices
  where id = v_context.invoice_id
  for update;
  if not found or v_invoice.status not in ('open', 'overdue') then
    raise exception 'invoice_unavailable' using errcode = 'P0002';
  end if;

  -- Return existing active attempt if same idempotency key is submitted
  return query select pa.* from public.payment_attempts pa
    where pa.invoice_id = v_invoice.id and pa.idempotency_key = p_idempotency_key
      and pa.status in ('PENDING_DEPOSIT', 'PROCESSING', 'KNOWN_DEPOSIT_TX');
  if found then return; end if;

  -- Atomic expiration: Expire abandoned unreserved attempts with no broadcast or settlement.
  -- NEVER expire a reserved payment (circle_execution_reserved_at is not null),
  -- nor any payment with a recorded broadcast hash or approval hash.
  update public.payment_attempts pa
  set status = 'QUOTE_EXPIRED',
      circle_recovery_updated_at = statement_timestamp()
  where pa.invoice_id = v_invoice.id
    and pa.mode = 'live'
    and pa.status in ('PENDING_DEPOSIT', 'MOCK_QUOTE_READY')
    and pa.quote_expires_at is not null
    and pa.quote_expires_at <= statement_timestamp()
    and pa.circle_execution_reserved_at is null
    and pa.transaction_hash is null
    and pa.circle_approval_tx_hash is null
    and pa.settlement_resolved_at is null;

  -- Check if any active attempt still exists
  if exists (
    select 1 from public.payment_attempts pa
    where pa.invoice_id = v_invoice.id
      and (
        pa.status in ('MOCK_QUOTE_READY', 'PENDING_DEPOSIT', 'KNOWN_DEPOSIT_TX', 'PROCESSING')
        or (pa.mode = 'live' and pa.status = 'SUCCESS')
      )
  ) then
    raise exception 'active_payment_attempt_exists' using errcode = '23505';
  end if;

  return query insert into public.payment_attempts (
    invoice_id, business_id, mode, source_asset_id, source_network,
    destination_asset_id, destination_network, recipient_address, idempotency_key,
    requested_amount, expected_received_amount, deposit_address, deposit_memo,
    quote_expires_at, quote_snapshot, status
  ) values (v_invoice.id, v_invoice.business_id, 'live', p_source_asset_id,
    p_source_network, p_destination_asset_id, p_destination_network, p_recipient_address,
    p_idempotency_key, p_requested_amount, p_expected_received_amount, p_deposit_address,
    p_deposit_memo, p_quote_expires_at, p_quote_snapshot, 'PENDING_DEPOSIT')
  returning *;
end;
$$;

create or replace function public.update_live_attempt_status(
  p_token_hash text, p_attempt_id uuid, p_status public.payment_attempt_status, p_transaction_hash text default null
) returns setof public.payment_attempts
language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.payment_attempts%rowtype;
begin
  select pa.* into v_attempt from public.payment_attempts pa
  join public.invoices i on i.id = pa.invoice_id
  where pa.id = p_attempt_id and pa.mode = 'live' and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  for update of pa;
  if not found then raise exception 'attempt_unavailable' using errcode = 'P0002'; end if;

  if v_attempt.status in ('SUCCESS','REFUNDED','FAILED','INCOMPLETE_DEPOSIT') then
    return query select * from public.get_shared_live_attempt(p_token_hash, p_attempt_id);
    return;
  end if;

  if p_status not in ('PENDING_DEPOSIT','KNOWN_DEPOSIT_TX','PROCESSING','SUCCESS','REFUNDED','FAILED','INCOMPLETE_DEPOSIT','QUOTE_EXPIRED') then
    raise exception 'invalid_live_status' using errcode = '22023';
  end if;

  -- Reservation & broadcast protection: never release or expire a reserved/broadcast payment
  if v_attempt.circle_execution_reserved_at is not null or v_attempt.transaction_hash is not null
      or v_attempt.circle_approval_tx_hash is not null then
    if p_status in ('PENDING_DEPOSIT', 'QUOTE_EXPIRED', 'FAILED') then
      raise exception 'circle_execution_already_reserved' using errcode = '22023';
    end if;
  end if;

  if p_status = 'QUOTE_EXPIRED' then
    if v_attempt.quote_expires_at is null or v_attempt.quote_expires_at > statement_timestamp() then
      raise exception 'quote_not_expired' using errcode = '22023';
    end if;
  end if;

  return query update public.payment_attempts set status = p_status,
    transaction_hash = coalesce(p_transaction_hash, transaction_hash)
    where id = p_attempt_id returning *;
end;
$$;

create or replace function public.close_live_attempt(
  p_token_hash text, p_attempt_id uuid, p_status public.payment_attempt_status
) returns setof public.payment_attempts
language plpgsql security definer set search_path = '' as $$
declare v_attempt public.payment_attempts%rowtype;
begin
  select pa.* into v_attempt from public.payment_attempts pa
  join public.invoices i on i.id = pa.invoice_id
  where pa.id = p_attempt_id and pa.mode = 'live' and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  for update of pa;
  if not found then raise exception 'attempt_unavailable' using errcode = 'P0002'; end if;

  if v_attempt.circle_execution_reserved_at is not null then
    raise exception 'circle_execution_already_reserved' using errcode = '22023';
  end if;
  if v_attempt.circle_approval_tx_hash is not null or v_attempt.transaction_hash is not null then
    raise exception 'deposit_already_submitted' using errcode = '22023';
  end if;
  if v_attempt.status <> 'PENDING_DEPOSIT' then
    raise exception 'invalid_execution_start_state' using errcode = '22023';
  end if;

  if p_status = 'QUOTE_EXPIRED' then
    if v_attempt.quote_expires_at is null or v_attempt.quote_expires_at > statement_timestamp() then
      raise exception 'quote_not_expired' using errcode = '22023';
    end if;
  elsif p_status <> 'FAILED' then
    raise exception 'invalid_close_status' using errcode = '22023';
  end if;

  return query update public.payment_attempts set status = p_status where id = p_attempt_id returning *;
end;
$$;

revoke all on function public.expire_abandoned_payment_attempts(text) from public, anon, authenticated;
grant execute on function public.expire_abandoned_payment_attempts(text) to service_role;
revoke all on function public.create_committed_payment_attempt(text, uuid, text, text, text, text, text, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.create_committed_payment_attempt(text, uuid, text, text, text, text, text, text, text, text, text, timestamptz, jsonb) to service_role;
revoke all on function public.update_live_attempt_status(text, uuid, public.payment_attempt_status, text) from public, anon, authenticated;
grant execute on function public.update_live_attempt_status(text, uuid, public.payment_attempt_status, text) to service_role;
revoke all on function public.close_live_attempt(text, uuid, public.payment_attempt_status) from public, anon, authenticated;
grant execute on function public.close_live_attempt(text, uuid, public.payment_attempt_status) to service_role;
