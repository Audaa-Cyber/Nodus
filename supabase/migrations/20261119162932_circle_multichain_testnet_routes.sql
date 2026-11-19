-- Expand the protected Circle CCTP reservation guard to the four enabled EVM testnets.
-- Source and destination assets must remain canonical USDC identifiers and networks distinct.
create or replace function public.mark_circle_execution_started(
  p_token_hash text, p_attempt_id uuid, p_expected_payer text
) returns setof public.payment_attempts
language plpgsql security definer set search_path = '' as $$
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
  where pa.id = p_attempt_id and pa.mode = 'live'
    and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  for update of pa, i, bp;
  if not found then raise exception 'attempt_unavailable' using errcode = 'P0002'; end if;

  select pa.* into v_attempt from public.payment_attempts pa where pa.id = p_attempt_id;
  select i.* into v_invoice from public.invoices i where i.id = v_attempt.invoice_id;
  select bp.* into v_business from public.business_profiles bp where bp.id = v_invoice.business_id;

  if v_invoice.status not in ('open', 'overdue') then
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
    or v_business.receiving_address is null
    or v_business.receiving_network is null
    or lower(coalesce(v_snapshot->>'recipient', '')) <> lower(v_attempt.recipient_address)
    or lower(v_attempt.recipient_address) is distinct from lower(v_business.receiving_address)
    or v_attempt.destination_network is distinct from v_business.receiving_network
    or v_snapshot->>'minimumReceived' is distinct from v_attempt.expected_received_amount
    or v_attempt.expected_received_amount is null
    or v_attempt.requested_amount is null
    or v_attempt.source_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia')
    or v_attempt.source_asset_id <> (v_attempt.source_network || ':usdc')
    or v_attempt.destination_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia')
    or v_attempt.destination_network = v_attempt.source_network
    or v_attempt.destination_asset_id <> (v_attempt.destination_network || ':usdc')
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
revoke all on function public.mark_circle_execution_started(text, uuid, text) from public, anon, authenticated;
grant execute on function public.mark_circle_execution_started(text, uuid, text) to service_role;


-- Allow only verified Circle CCTP USDC settlements across distinct enabled EVM testnets.
create or replace function public.enqueue_verified_near_settlement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.payment_attempts%rowtype;
  v_evidence jsonb := new.evidence;
  v_source jsonb := coalesce(v_evidence->'sourceProof','{}'::jsonb);
  v_destination jsonb := coalesce(v_evidence->'destinationProof','{}'::jsonb);
  v_eligible boolean;
begin
  if new.provider_status <> 'SUCCESS'
    or new.outcome not in ('VERIFIED','PARTIAL','OVERPAID','REVIEW_REQUIRED')
    or new.destination_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia')
    or new.destination_asset_id <> (new.destination_network || ':usdc') then
    return new;
  end if;

  select pa.* into v_attempt from public.payment_attempts pa where pa.id = new.payment_attempt_id;
  if not found then return new; end if;
  if v_attempt.mode <> 'live'
    or v_attempt.source_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia')
    or v_attempt.source_asset_id <> (v_attempt.source_network || ':usdc')
    or v_attempt.destination_network <> new.destination_network
    or v_attempt.destination_network = v_attempt.source_network
    or v_attempt.destination_asset_id <> (v_attempt.destination_network || ':usdc')
    or v_attempt.quote_snapshot->>'type' <> 'circle_cctp' then
    return new;
  end if;

  v_eligible := jsonb_typeof(v_evidence) = 'object'
    and v_source->>'sourceTransactionHash' = v_attempt.transaction_hash
    and v_source->>'sourceBlockNumber' ~ '^[1-9][0-9]*$'
    and v_source->>'sourceBlockHash' ~ '^0x[0-9a-fA-F]{64}$'
    and v_source->>'nonce' ~ '^[1-9][0-9]*$'
    and v_source->>'messageHash' ~ '^0x[0-9a-fA-F]{64}$'
    and v_destination->>'verified' = 'true'
    and v_destination->>'finalityConfirmed' = 'true'
    and v_destination->>'amount' = new.received_amount_base_units
    and jsonb_typeof(v_destination->'transactionHashes') = 'array'
    and v_destination->'transactionHashes' = new.destination_tx_hashes
    and jsonb_typeof(v_destination->'transactions') = 'array'
    and jsonb_array_length(v_destination->'transactions') = 1
    and v_destination->'transactions'->0->>'transactionHash' = new.destination_tx_hashes->>0
    and v_destination->'transactions'->0->>'blockNumber' ~ '^[1-9][0-9]*$'
    and v_destination->'transactions'->0->>'blockHash' ~ '^0x[0-9a-fA-F]{64}$'
    and jsonb_array_length(new.destination_tx_hashes) = 1;

  insert into public.near_settlement_outbox (
    payment_settlement_id,reconciliation_id,invoice_id,payment_attempt_id,
    source_transaction_hash,destination_tx_hashes,status,last_error_code
  ) values (
    new.id,new.id,new.invoice_id,new.payment_attempt_id,coalesce(v_attempt.transaction_hash,''),
    new.destination_tx_hashes,case when v_eligible then 'pending' else 'blocked' end,
    case when v_eligible then null else 'near_evidence_ineligible' end
  ) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists payment_settlement_enqueue_near on public.payment_settlements;
create trigger payment_settlement_enqueue_near after insert on public.payment_settlements for each row execute function public.enqueue_verified_near_settlement();
revoke all on function public.enqueue_verified_near_settlement() from public, anon, authenticated;
