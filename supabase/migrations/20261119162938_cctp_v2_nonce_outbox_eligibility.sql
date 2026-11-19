-- CCTP V2 nonces are bytes32 values. Keep the full-width value intact for the
-- worker and contract instead of requiring a lossy decimal u64 representation.
create or replace function public.near_settlement_evidence_eligible(
  p_settlement public.payment_settlements,
  p_attempt public.payment_attempts
) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    p_settlement.provider_status = 'SUCCESS'
    and p_settlement.outcome in ('VERIFIED','PARTIAL','OVERPAID','REVIEW_REQUIRED')
    and p_settlement.destination_network in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia')
    and p_settlement.destination_asset_id = (p_settlement.destination_network || ':usdc')
    and p_attempt.mode = 'live'
    and p_attempt.source_network in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia')
    and p_attempt.source_asset_id = (p_attempt.source_network || ':usdc')
    and p_attempt.destination_network = p_settlement.destination_network
    and p_attempt.destination_network <> p_attempt.source_network
    and p_attempt.destination_asset_id = (p_attempt.destination_network || ':usdc')
    and p_attempt.quote_snapshot->>'type' = 'circle_cctp'
    and jsonb_typeof(p_settlement.evidence) = 'object'
    and p_settlement.evidence->'sourceProof'->>'sourceTransactionHash' = p_attempt.transaction_hash
    and p_settlement.evidence->'sourceProof'->>'sourceBlockNumber' ~ '^[1-9][0-9]*$'
    and p_settlement.evidence->'sourceProof'->>'sourceBlockHash' ~ '^0x[0-9a-fA-F]{64}$'
    and p_settlement.evidence->'sourceProof'->>'nonce' ~ '^0x[0-9a-fA-F]{64}$'
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

create or replace function public.enqueue_verified_near_settlement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.payment_attempts%rowtype;
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

drop trigger if exists payment_settlement_enqueue_near on public.payment_settlements;
create trigger payment_settlement_enqueue_near after insert on public.payment_settlements
for each row execute function public.enqueue_verified_near_settlement();
revoke all on function public.enqueue_verified_near_settlement() from public, anon, authenticated;
revoke all on function public.near_settlement_evidence_eligible(public.payment_settlements, public.payment_attempts) from public, anon, authenticated;

-- Recovery is explicit and only permits never-submitted rows created by the old
-- nonce-format predicate. Deployment must precede calling this service-only RPC.
create or replace function public.requeue_near_settlement_outbox(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_outbox public.near_settlement_outbox%rowtype;
  v_settlement public.payment_settlements%rowtype;
  v_attempt public.payment_attempts%rowtype;
begin
  select o.* into v_outbox from public.near_settlement_outbox o where o.id = p_id for update;
  if not found or v_outbox.status <> 'blocked'
    or v_outbox.last_error_code <> 'near_evidence_ineligible'
    or v_outbox.attempt_count <> 0 or v_outbox.near_transaction_hash is not null then
    return false;
  end if;
  select ps.* into v_settlement from public.payment_settlements ps
    where ps.id = v_outbox.payment_settlement_id;
  if not found then return false; end if;
  select pa.* into v_attempt from public.payment_attempts pa
    where pa.id = v_outbox.payment_attempt_id;
  if not found then return false; end if;
  if v_outbox.invoice_id <> v_settlement.invoice_id
    or v_settlement.payment_attempt_id <> v_attempt.id
    or v_outbox.source_transaction_hash <> v_attempt.transaction_hash
    or v_outbox.destination_tx_hashes <> v_settlement.destination_tx_hashes
    or not public.near_settlement_evidence_eligible(v_settlement, v_attempt) then
    return false;
  end if;
  update public.near_settlement_outbox set status='pending',
    next_attempt_at=statement_timestamp(),last_error_code=null,
    lock_token=null,locked_until=null,updated_at=statement_timestamp()
  where id=p_id and status='blocked' and attempt_count=0 and near_transaction_hash is null;
  return found;
end;
$$;
revoke all on function public.requeue_near_settlement_outbox(uuid) from public, anon, authenticated;
grant execute on function public.requeue_near_settlement_outbox(uuid) to service_role;
