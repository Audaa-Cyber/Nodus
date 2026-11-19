-- Durable delivery queue for independently verified CCTP V2 settlements.
-- PostgreSQL remains authoritative; this table is private to service_role.
create table if not exists public.near_settlement_outbox (
  id uuid primary key default gen_random_uuid(),
  payment_settlement_id uuid not null references public.payment_settlements(id) on delete restrict,
  reconciliation_id uuid not null,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  payment_attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
  source_transaction_hash text not null,
  destination_tx_hashes jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','submitted','blocked')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default statement_timestamp(),
  lock_token uuid,
  locked_until timestamptz,
  near_transaction_hash text,
  last_error_code text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  submitted_at timestamptz,
  constraint near_settlement_outbox_settlement_uq unique(payment_settlement_id),
  constraint near_settlement_outbox_reconciliation_uq unique(reconciliation_id),
  constraint near_settlement_outbox_attempt_uq unique(payment_attempt_id),
  constraint near_settlement_outbox_hashes_array check(jsonb_typeof(destination_tx_hashes) = 'array')
);

alter table public.near_settlement_outbox enable row level security;
revoke all on public.near_settlement_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.near_settlement_outbox to service_role;

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
    or new.destination_network <> 'arbitrum-sepolia'
    or new.destination_asset_id <> 'arbitrum-sepolia:usdc' then
    return new;
  end if;

  select pa.* into v_attempt from public.payment_attempts pa where pa.id = new.payment_attempt_id;
  if not found then return new; end if;
  if v_attempt.mode <> 'live' or v_attempt.source_network <> 'base-sepolia'
    or v_attempt.source_asset_id <> 'base-sepolia:usdc'
    or v_attempt.destination_network <> 'arbitrum-sepolia'
    or v_attempt.destination_asset_id <> 'arbitrum-sepolia:usdc'
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
create trigger payment_settlement_enqueue_near after insert on public.payment_settlements
for each row execute function public.enqueue_verified_near_settlement();
revoke all on function public.enqueue_verified_near_settlement() from public, anon, authenticated;

create or replace function public.claim_near_settlement_outbox(p_limit integer default 10)
returns setof public.near_settlement_outbox language plpgsql security definer set search_path = '' as $$
begin
  if p_limit < 1 or p_limit > 50 then raise exception 'near_outbox_limit_invalid'; end if;
  return query
  with candidates as (
    select o.id from public.near_settlement_outbox o
    where ((o.status = 'pending' and o.next_attempt_at <= statement_timestamp())
       or (o.status = 'processing' and o.locked_until < statement_timestamp()))
    and not exists (
      select 1 from public.near_settlement_outbox older
      where older.invoice_id = o.invoice_id and older.created_at < o.created_at
        and older.status <> 'submitted'
    )
    and not exists (
      select 1 from public.near_settlement_outbox active
      where active.invoice_id = o.invoice_id and active.id <> o.id
        and active.status = 'processing' and active.locked_until >= statement_timestamp()
    )
    and pg_try_advisory_xact_lock(hashtextextended(o.invoice_id::text, 0))
    order by o.created_at for update skip locked limit p_limit
  ), claimed as (
    update public.near_settlement_outbox o set status='processing',
      lock_token=gen_random_uuid(), locked_until=statement_timestamp()+interval '2 minutes',
      attempt_count=o.attempt_count+1, updated_at=statement_timestamp()
    from candidates c where o.id=c.id returning o.*
  ) select * from claimed;
end;
$$;

create or replace function public.finish_near_settlement_outbox(p_id uuid,p_lock_token uuid,p_near_transaction_hash text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.near_settlement_outbox set status='submitted',near_transaction_hash=p_near_transaction_hash,
    submitted_at=statement_timestamp(),last_error_code=null,lock_token=null,locked_until=null,updated_at=statement_timestamp()
  where id=p_id and status='processing' and lock_token=p_lock_token;
  return found;
end;
$$;

create or replace function public.retry_near_settlement_outbox(p_id uuid,p_lock_token uuid,p_error_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.near_settlement_outbox set status='pending',
    next_attempt_at=statement_timestamp()+make_interval(secs=>least(3600, power(2,least(attempt_count,11))::integer)),
    last_error_code=left(coalesce(nullif(p_error_code,''),'near_delivery_failed'),96),
    lock_token=null,locked_until=null,updated_at=statement_timestamp()
  where id=p_id and status='processing' and lock_token=p_lock_token;
  return found;
end;
$$;

create or replace function public.block_near_settlement_outbox(p_id uuid,p_lock_token uuid,p_error_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.near_settlement_outbox set status='blocked',
    last_error_code=left(coalesce(nullif(p_error_code,''),'near_delivery_blocked'),96),
    lock_token=null,locked_until=null,updated_at=statement_timestamp()
  where id=p_id and status='processing' and lock_token=p_lock_token;
  return found;
end;
$$;

revoke all on function public.claim_near_settlement_outbox(integer) from public, anon, authenticated;
revoke all on function public.finish_near_settlement_outbox(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.retry_near_settlement_outbox(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.block_near_settlement_outbox(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.claim_near_settlement_outbox(integer) to service_role;
grant execute on function public.finish_near_settlement_outbox(uuid,uuid,text) to service_role;
grant execute on function public.retry_near_settlement_outbox(uuid,uuid,text) to service_role;
grant execute on function public.block_near_settlement_outbox(uuid,uuid,text) to service_role;
