-- Keep the settlement enqueue trigger aligned with canonical CCTP V2 bytes32
-- nonce validation. The previous trigger still required a decimal nonce even
-- though near_settlement_evidence_eligible had already been upgraded.
create or replace function public.enqueue_verified_near_settlement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.payment_attempts%rowtype;
  v_eligible boolean;
begin
  select pa.* into v_attempt
  from public.payment_attempts pa
  where pa.id = new.payment_attempt_id;
  if not found then return new; end if;

  -- Only create NEAR jobs for live Circle CCTP settlements. Unsupported or
  -- demo payments remain outside this protocol-specific queue.
  if new.provider_status <> 'SUCCESS'
    or new.outcome not in ('VERIFIED','PARTIAL','OVERPAID','REVIEW_REQUIRED')
    or v_attempt.mode <> 'live'
    or v_attempt.quote_snapshot->>'type' <> 'circle_cctp' then
    return new;
  end if;

  v_eligible := public.near_settlement_evidence_eligible(new, v_attempt);

  insert into public.near_settlement_outbox (
    payment_settlement_id,reconciliation_id,invoice_id,payment_attempt_id,
    source_transaction_hash,destination_tx_hashes,status,last_error_code
  ) values (
    new.id,new.id,new.invoice_id,new.payment_attempt_id,
    coalesce(v_attempt.transaction_hash,''),new.destination_tx_hashes,
    case when v_eligible then 'pending' else 'blocked' end,
    case when v_eligible then null else 'near_evidence_ineligible' end
  ) on conflict do nothing;

  return new;
end;
$$;

-- Backfill eligible CCTP settlements created before this trigger fix. Preserve
-- their original verified evidence; the worker revalidates it before attesting.
insert into public.near_settlement_outbox (
  payment_settlement_id,reconciliation_id,invoice_id,payment_attempt_id,
  source_transaction_hash,destination_tx_hashes,status,last_error_code
)
select
  s.id,s.id,s.invoice_id,s.payment_attempt_id,coalesce(a.transaction_hash,''),
  s.destination_tx_hashes,
  case when public.near_settlement_evidence_eligible(s,a) then 'pending' else 'blocked' end,
  case when public.near_settlement_evidence_eligible(s,a) then null else 'near_evidence_ineligible' end
from public.payment_settlements s
join public.payment_attempts a on a.id=s.payment_attempt_id
where s.provider_status='SUCCESS'
  and s.outcome in ('VERIFIED','PARTIAL','OVERPAID','REVIEW_REQUIRED')
  and a.mode='live'
  and a.quote_snapshot->>'type'='circle_cctp'
on conflict do nothing;

-- Recover jobs blocked solely by the obsolete decimal-nonce predicate after
-- the evidence predicate above confirms every original proof field.
update public.near_settlement_outbox o
set status='pending',last_error_code=null,next_attempt_at=statement_timestamp(),
    lock_token=null,locked_until=null,updated_at=statement_timestamp()
from public.payment_settlements s
join public.payment_attempts a on a.id=s.payment_attempt_id
where o.payment_settlement_id=s.id
  and o.status='blocked'
  and o.last_error_code='near_evidence_ineligible'
  and public.near_settlement_evidence_eligible(s,a);
