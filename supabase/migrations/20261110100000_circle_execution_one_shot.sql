-- Reserve Circle execution once per live attempt. The reservation survives
-- status changes and is never cleared by recovery or broadcast attachment.
alter table public.payment_attempts
  add column circle_execution_reserved_at timestamptz,
  add constraint payment_attempts_circle_execution_reservation_mode_check
    check (circle_execution_reserved_at is null or mode = 'live');

create function public.guard_circle_execution_reservation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.mode = 'live' and old.circle_execution_reserved_at is not null
    and new.circle_execution_reserved_at is distinct from old.circle_execution_reserved_at then
    raise exception 'circle_execution_reservation_is_immutable' using errcode = '22023';
  end if;
  if old.mode = 'live' and old.circle_execution_reserved_at is null
    and new.circle_execution_reserved_at is not null
    and current_setting('nodus.circle_execution_reserving', true) is distinct from 'yes' then
    raise exception 'circle_execution_reservation_requires_authorized_rpc' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger payment_attempts_guard_circle_execution_reservation
  before update on public.payment_attempts
  for each row execute function public.guard_circle_execution_reservation();

-- Replace the prior two-argument RPC so callers cannot continue using its
-- repeatable PROCESSING transition. The expected payer comes from the wallet
-- and must match the immutable payer captured in the quote snapshot.
drop function public.mark_circle_execution_started(text, uuid);

create function public.mark_circle_execution_started(
  p_token_hash text, p_attempt_id uuid, p_expected_payer text
) returns setof public.payment_attempts
language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.payment_attempts%rowtype;
  v_invoice public.invoices%rowtype;
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

  select pa.* into v_attempt
  from public.payment_attempts pa
  join public.invoices i on i.id = pa.invoice_id
  where pa.id = p_attempt_id and pa.mode = 'live'
    and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  for update of pa, i;
  if not found then raise exception 'attempt_unavailable' using errcode = 'P0002'; end if;

  select i.* into v_invoice from public.invoices i where i.id = v_attempt.invoice_id;
  if not found or v_invoice.status not in ('open', 'overdue') then
    raise exception 'invoice_unavailable' using errcode = 'P0002';
  end if;
  if v_attempt.circle_execution_reserved_at is not null then
    raise exception 'circle_execution_already_reserved' using errcode = '22023';
  end if;
  if v_attempt.status <> 'PENDING_DEPOSIT'
    or v_attempt.circle_recovery_state <> 'AWAITING_SOURCE'
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
    or v_snapshot->>'type' <> 'circle_cctp'
    or v_snapshot->>'invoiceId' is distinct from v_attempt.invoice_id::text
    or v_snapshot->>'invoiceAmountMinor' is distinct from v_invoice.amount_minor::text
    or v_snapshot->>'invoiceCurrency' is distinct from v_invoice.currency
    or v_invoice.currency <> 'USD'
    or lower(coalesce(v_snapshot->>'payer', '')) <> lower(p_expected_payer)
    or v_snapshot->>'sourceNetwork' is distinct from v_attempt.source_network
    or v_snapshot->>'sourceAssetId' is distinct from v_attempt.source_asset_id
    or v_snapshot->>'destinationNetwork' is distinct from v_attempt.destination_network
    or v_snapshot->>'destinationAssetId' is distinct from v_attempt.destination_asset_id
    or lower(coalesce(v_snapshot->>'recipient', '')) <> lower(coalesce(v_attempt.recipient_address, ''))
    or v_attempt.recipient_address is null
    or lower(v_attempt.recipient_address) is distinct from lower(v_invoice.receiving_address)
    or v_snapshot->>'minimumReceived' is distinct from v_attempt.expected_received_amount
    or v_attempt.expected_received_amount is null
    or v_attempt.requested_amount is null
    or v_attempt.source_network <> 'base-sepolia'
    or v_attempt.source_asset_id <> 'base-sepolia:usdc'
    or v_attempt.destination_network <> 'arbitrum-sepolia'
    or v_attempt.destination_asset_id <> 'arbitrum-sepolia:usdc'
    or v_attempt.expected_received_amount !~ '^[1-9][0-9]*$'
    or v_attempt.requested_amount !~ '^[1-9][0-9]*$'
    or v_snapshot->>'quote' is null or btrim(v_snapshot->>'quote') = '' then
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
    or v_received is null or v_total_debit is null or v_fee_total is null
    or v_attempt.expected_received_amount is null or v_attempt.requested_amount is null
    or v_received * 1000000 <> v_attempt.expected_received_amount::numeric
    or v_total_debit * 1000000 <> v_attempt.requested_amount::numeric
    or v_total_debit - v_received <> v_fee_total
    or v_invoice.amount_minor::numeric * 10000 <> v_attempt.expected_received_amount::numeric then
    raise exception 'attempt_quote_binding_mismatch' using errcode = '22023';
  end if;

  perform set_config('nodus.circle_execution_reserving', 'yes', true);
  return query update public.payment_attempts pa set
    circle_execution_reserved_at = statement_timestamp(),
    status = 'PROCESSING',
    circle_recovery_state = 'AWAITING_SOURCE',
    circle_recovery_updated_at = statement_timestamp()
  where pa.id = p_attempt_id
    and pa.circle_execution_reserved_at is null
    and pa.status = 'PENDING_DEPOSIT'
  returning pa.*;
end;
$$;

revoke all on function public.guard_circle_execution_reservation() from public, anon, authenticated;
revoke all on function public.mark_circle_execution_started(text, uuid, text) from public, anon, authenticated;
grant execute on function public.mark_circle_execution_started(text, uuid, text) to service_role;
