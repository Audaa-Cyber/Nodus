-- Same-chain settlement uses existing evidence, transaction uniqueness, and outbox tables.
create or replace function public.cctp_near_settlement_evidence_eligible(
  p_settlement public.payment_settlements,
  p_attempt public.payment_attempts
) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    p_settlement.provider_status = 'SUCCESS'
    and p_settlement.outcome in ('VERIFIED','PARTIAL','OVERPAID','REVIEW_REQUIRED')
    and p_settlement.destination_network in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    and p_settlement.destination_asset_id = (p_settlement.destination_network || ':usdc')
    and p_attempt.mode = 'live'
    and p_attempt.source_network in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    and p_attempt.source_asset_id = (p_attempt.source_network || ':usdc')
    and p_attempt.destination_network = p_settlement.destination_network
    and p_attempt.destination_network <> p_attempt.source_network
    and p_attempt.destination_asset_id = (p_attempt.destination_network || ':usdc')
    and p_attempt.quote_snapshot->>'type' = 'circle_cctp'
    and jsonb_typeof(p_settlement.evidence) = 'object'
    and p_settlement.evidence->'sourceProof'->>'sourceTransactionHash' = p_attempt.transaction_hash
    and p_settlement.evidence->'sourceProof'->>'sourceBlockNumber' ~ '^[1-9][0-9]*$'
    and p_settlement.evidence->'sourceProof'->>'sourceBlockHash' ~ '^0x[0-9a-fA-F]{64}$'
    and (
      p_settlement.evidence->'sourceProof'->>'nonce' ~* '^0x[0-9a-f]{64}$'
      or p_settlement.evidence->'sourceProof'->>'nonce' ~ '^[1-9][0-9]*$'
    )
    and p_settlement.evidence->'sourceProof'->>'messageHash' ~ '^0x[0-9a-fA-F]{64}$'
    and p_settlement.evidence->'destinationProof'->>'verified' = 'true'
    and p_settlement.evidence->'destinationProof'->>'finalityConfirmed' = 'true'
    and p_settlement.evidence->'destinationProof'->>'amount' = p_settlement.received_amount_base_units
    and jsonb_typeof(p_settlement.evidence->'destinationProof'->'transactionHashes') = 'array'
    and p_settlement.evidence->'destinationProof'->'transactionHashes' = p_settlement.destination_tx_hashes
    and jsonb_typeof(p_settlement.evidence->'destinationProof'->'transactions') = 'array'
    and jsonb_array_length(p_settlement.evidence->'destinationProof'->'transactions') = 1
    and p_settlement.evidence->'destinationProof'->'transactions'->0->>'transactionHash' = p_settlement.destination_tx_hashes->>0
    and p_settlement.evidence->'destinationProof'->'transactions'->0->>'blockNumber' ~ '^[1-9][0-9]*$'
    and p_settlement.evidence->'destinationProof'->'transactions'->0->>'blockHash' ~ '^0x[0-9a-fA-F]{64}$'
    and jsonb_array_length(p_settlement.destination_tx_hashes) = 1,
    false
  );
$$;


revoke all on function public.cctp_near_settlement_evidence_eligible(public.payment_settlements, public.payment_attempts) from public, anon, authenticated;
create or replace function public.near_settlement_evidence_eligible(
  p_settlement public.payment_settlements, p_attempt public.payment_attempts
) returns boolean language sql immutable set search_path = '' as $$
  select public.cctp_near_settlement_evidence_eligible(p_settlement,p_attempt) or coalesce(
    p_attempt.mode = 'live' and p_attempt.quote_snapshot->>'type' = 'circle_direct'
    and p_attempt.source_network = p_attempt.destination_network
    and p_attempt.destination_network in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    and p_settlement.payment_attempt_id = p_attempt.id and p_settlement.invoice_id = p_attempt.invoice_id
    and p_settlement.provider_status = 'SUCCESS' and p_settlement.outcome in ('VERIFIED','PARTIAL','OVERPAID','REVIEW_REQUIRED')
    and p_settlement.destination_network = p_attempt.destination_network
    and p_settlement.destination_asset_id = (p_attempt.destination_network || ':usdc')
    and p_settlement.recipient_address = p_attempt.recipient_address
    and p_settlement.evidence->>'routeType' = 'same_chain'
    and p_settlement.evidence->'destinationProof'->>'verified' = 'true'
    and p_settlement.evidence->'destinationProof'->>'finalityConfirmed' = 'true'
    and lower(p_settlement.evidence->'destinationProof'->>'payer') = lower(p_attempt.quote_snapshot->>'payer')
    and lower(p_settlement.evidence->'destinationProof'->>'contractAddress') = lower(p_attempt.quote_snapshot->>'destinationUsdc')
    and p_settlement.evidence->'destinationProof'->>'amount' = p_settlement.received_amount_base_units
    and p_settlement.evidence->'destinationProof'->'transactionHashes' = p_settlement.destination_tx_hashes
    and p_settlement.destination_tx_hashes = jsonb_build_array(p_attempt.transaction_hash)
    and jsonb_array_length(p_settlement.evidence->'destinationProof'->'transactions') = 1
    and p_settlement.evidence->'destinationProof'->'transactions'->0->>'transactionHash' = p_attempt.transaction_hash
    and p_settlement.evidence->'destinationProof'->'transactions'->0->>'blockNumber' ~ '^[1-9][0-9]*$'
    and p_settlement.evidence->'destinationProof'->'transactions'->0->>'blockHash' ~ '^0x[0-9a-fA-F]{64}$', false);
$$;
revoke all on function public.near_settlement_evidence_eligible(public.payment_settlements, public.payment_attempts) from public, anon, authenticated;
create or replace function public.enqueue_verified_near_settlement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.payment_attempts%rowtype;
  v_eligible boolean;
begin
  if new.provider_status <> 'SUCCESS'
    or new.outcome not in ('VERIFIED','PARTIAL','OVERPAID','REVIEW_REQUIRED')
    or new.destination_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    or new.destination_asset_id <> (new.destination_network || ':usdc') then
    return new;
  end if;

  select pa.* into v_attempt from public.payment_attempts pa where pa.id = new.payment_attempt_id;
  if not found then return new; end if;

  if v_attempt.mode <> 'live'
    or v_attempt.source_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    or v_attempt.source_asset_id <> (v_attempt.source_network || ':usdc')
    or v_attempt.destination_network <> new.destination_network
    or v_attempt.destination_asset_id <> (v_attempt.destination_network || ':usdc')
    or v_attempt.quote_snapshot->>'type' not in ('circle_cctp','circle_direct') then
    return new;
  end if;

  v_eligible := public.near_settlement_evidence_eligible(new, v_attempt);

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

revoke all on function public.enqueue_verified_near_settlement() from public, anon, authenticated;

-- Reserve direct execution before asking for a signature. Reuse the existing
-- reservation timestamp; route identity remains circle_direct in the snapshot.
create function public.reserve_direct_payment_execution(p_token_hash text,p_attempt_id uuid,p_expected_payer text)
returns setof public.payment_attempts language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('nodus.circle_execution_reserving', 'yes', true);
  return query update public.payment_attempts pa set status='PROCESSING',circle_execution_reserved_at=statement_timestamp()
  from public.invoices i where pa.id=p_attempt_id and pa.invoice_id=i.id
    and i.share_token_hash=p_token_hash and i.share_token_expires_at>statement_timestamp()
    and i.status in ('open','overdue') and pa.mode='live'
    and pa.quote_snapshot->>'type'='circle_direct'
    and lower(pa.quote_snapshot->>'payer')=lower(p_expected_payer)
    and pa.source_network=pa.destination_network
    and pa.status='PENDING_DEPOSIT' and pa.transaction_hash is null
    and pa.circle_execution_reserved_at is null and pa.quote_expires_at>statement_timestamp()
  returning pa.*;
end;
$$;
revoke all on function public.reserve_direct_payment_execution(text,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_direct_payment_execution(text,uuid,text) to service_role;
create or replace function public.submit_circle_direct_broadcast_reference(
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

  if v_attempt.status not in ('PENDING_DEPOSIT', 'QUOTE_EXPIRED', 'PROCESSING')
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
