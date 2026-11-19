-- Keep a final transaction hash across an RPC/readback retry, and only close
-- the settlement outbox after get_settlement confirms the exact record.
create or replace function public.record_near_settlement_submission(
  p_id uuid,p_lock_token uuid,p_near_transaction_hash text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.near_settlement_outbox set near_transaction_hash=p_near_transaction_hash,
    updated_at=statement_timestamp()
  where id=p_id and status='processing' and lock_token=p_lock_token;
  return found;
end;
$$;

create or replace function public.finish_near_settlement_outbox(
  p_id uuid,p_lock_token uuid,p_near_transaction_hash text default null
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.near_settlement_outbox set status='submitted',
    near_transaction_hash=coalesce(p_near_transaction_hash,near_transaction_hash),
    submitted_at=statement_timestamp(),last_error_code=null,lock_token=null,locked_until=null,
    updated_at=statement_timestamp()
  where id=p_id and status='processing' and lock_token=p_lock_token;
  return found;
end;
$$;
revoke all on function public.record_near_settlement_submission(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.record_near_settlement_submission(uuid,uuid,text) to service_role;
