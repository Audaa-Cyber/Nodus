-- Persist same-chain Circle USDC transfer hashes without weakening the
-- reservation required by the Circle CCTP broadcast path.
create function public.submit_circle_direct_broadcast_reference(
  p_token_hash text,
  p_attempt_id uuid,
  p_source_tx_hash text,
  p_approval_tx_hash text default null
) returns setof public.payment_attempts
language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.payment_attempts%rowtype;
  v_invoice public.invoices%rowtype;
  v_snapshot jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_source_tx_hash is null or p_source_tx_hash !~ '^0x[0-9a-fA-F]{64}$'
    or (p_approval_tx_hash is not null and p_approval_tx_hash !~ '^0x[0-9a-fA-F]{64}$') then
    raise exception 'invalid_broadcast_reference' using errcode = '22023';
  end if;

  select pa.* into v_attempt
  from public.payment_attempts pa
  join public.invoices i on i.id = pa.invoice_id
  where pa.id = p_attempt_id and pa.mode = 'live'
    and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  for update of pa;
  if not found then raise exception 'attempt_unavailable' using errcode = 'P0002'; end if;

  select i.* into v_invoice from public.invoices i where i.id = v_attempt.invoice_id;
  v_snapshot := v_attempt.quote_snapshot;

  -- Bind this write to the immutable same-chain direct quote and invoice.
  if v_snapshot is null or jsonb_typeof(v_snapshot) is distinct from 'object'
    or v_snapshot->>'type' is distinct from 'circle_direct'
    or v_snapshot->>'invoiceId' is distinct from v_attempt.invoice_id::text
    or v_snapshot->>'invoiceAmountMinor' is distinct from v_invoice.amount_minor::text
    or v_snapshot->>'invoiceCurrency' is distinct from v_invoice.currency
    or v_snapshot->>'minimumReceived' is distinct from v_attempt.expected_received_amount
    or v_snapshot->>'totalDebit' is distinct from v_attempt.requested_amount
    or v_attempt.requested_amount is distinct from v_attempt.expected_received_amount
    or v_snapshot->>'sourceNetwork' is distinct from v_attempt.source_network
    or v_snapshot->>'destinationNetwork' is distinct from v_attempt.destination_network
    or v_attempt.source_network is distinct from v_attempt.destination_network
    or lower(coalesce(v_snapshot->>'recipient', '')) is distinct from lower(coalesce(v_attempt.recipient_address, ''))
    or v_attempt.recipient_address is null
    or v_attempt.requested_amount is null
    or v_attempt.requested_amount !~ '^[1-9][0-9]*$'
    or v_attempt.requested_amount::numeric <> v_invoice.amount_minor::numeric * 10000 then
    raise exception 'attempt_quote_binding_mismatch' using errcode = '22023';
  end if;

  if v_attempt.transaction_hash is not null
    and lower(v_attempt.transaction_hash) <> lower(p_source_tx_hash) then
    raise exception 'source_broadcast_reference_already_recorded' using errcode = '22023';
  end if;
  if v_attempt.circle_approval_tx_hash is not null and p_approval_tx_hash is not null
    and lower(v_attempt.circle_approval_tx_hash) <> lower(p_approval_tx_hash) then
    raise exception 'approval_reference_already_recorded' using errcode = '22023';
  end if;

  -- A retry with the same hash is safe, including after the verifier has
  -- already advanced the attempt to a terminal state.
  if v_attempt.transaction_hash is not null then
    return query select v_attempt.*;
    return;
  end if;

  if v_invoice.status not in ('open', 'overdue') then
    raise exception 'invoice_unavailable' using errcode = 'P0002';
  end if;

  if v_attempt.circle_execution_reserved_at is not null
    or v_attempt.status not in ('PENDING_DEPOSIT', 'QUOTE_EXPIRED')
    or v_attempt.settlement_resolved_at is not null then
    raise exception 'attempt_unavailable' using errcode = 'P0002';
  end if;

  return query update public.payment_attempts set
    transaction_hash = lower(p_source_tx_hash),
    circle_approval_tx_hash = coalesce(circle_approval_tx_hash, lower(p_approval_tx_hash)),
    circle_recovery_state = 'SOURCE_CANDIDATE',
    circle_recovery_updated_at = statement_timestamp(),
    status = 'KNOWN_DEPOSIT_TX'
  where id = p_attempt_id
  returning *;
end;
$$;

revoke all on function public.submit_circle_direct_broadcast_reference(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_circle_direct_broadcast_reference(text, uuid, text, text)
  to service_role;
