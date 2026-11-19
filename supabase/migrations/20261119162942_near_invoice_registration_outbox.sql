-- Invoice registry writes are performed by the authorized backend registrar.
-- The invoice row and its durable job are created in the same transaction.
alter table public.invoices
  add column near_registration_status text not null default 'pending'
    check (near_registration_status in ('pending','submitting','registered','failed')),
  add column near_registration_transaction_hash text,
  add column near_invoice_reference text,
  add column near_registered_at timestamptz,
  add column near_registration_failure_reason text;

create table public.near_invoice_registration_outbox (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references public.invoices(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','processing','registered','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default statement_timestamp(),
  lock_token uuid,
  locked_until timestamptz,
  near_transaction_hash text,
  onchain_invoice_reference text,
  failure_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  submitted_at timestamptz,
  registered_at timestamptz
);
alter table public.near_invoice_registration_outbox enable row level security;
revoke all on public.near_invoice_registration_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.near_invoice_registration_outbox to service_role;

create function public.enqueue_near_invoice_registration()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('open','overdue') and tg_op = 'INSERT' then
    insert into public.near_invoice_registration_outbox(invoice_id)
      values (new.id) on conflict (invoice_id) do nothing;
  elsif new.status in ('open','overdue') and old.status is distinct from new.status then
    insert into public.near_invoice_registration_outbox(invoice_id)
      values (new.id) on conflict (invoice_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger invoice_enqueue_near_registration
after insert or update of status on public.invoices
for each row execute function public.enqueue_near_invoice_registration();
revoke all on function public.enqueue_near_invoice_registration() from public, anon, authenticated;

create function public.claim_near_invoice_registration_outbox(p_limit integer default 10)
returns setof public.near_invoice_registration_outbox
language plpgsql security definer set search_path = '' as $$
begin
  if p_limit < 1 or p_limit > 50 then raise exception 'near_invoice_registration_limit_invalid'; end if;
  return query
  with candidates as (
    select o.id from public.near_invoice_registration_outbox o
    where ((o.status='pending' and o.next_attempt_at <= statement_timestamp())
      or (o.status='processing' and o.locked_until < statement_timestamp()))
    order by o.created_at for update skip locked limit p_limit
  ), claimed as (
    update public.near_invoice_registration_outbox o set status='processing',
      lock_token=gen_random_uuid(), locked_until=statement_timestamp()+interval '2 minutes',
      attempt_count=o.attempt_count+1, updated_at=statement_timestamp()
    from candidates c where o.id=c.id returning o.*
  ), marked as (
    update public.invoices i set near_registration_status='submitting'
    from claimed c where i.id=c.invoice_id returning i.id
  ) select c.* from claimed c join marked m on m.id=c.invoice_id;
end;
$$;

create function public.mark_near_invoice_registration_submitted(p_id uuid,p_lock_token uuid,p_transaction_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.near_invoice_registration_outbox set near_transaction_hash=p_transaction_hash,
    submitted_at=statement_timestamp(),updated_at=statement_timestamp()
  where id=p_id and status='processing' and lock_token=p_lock_token;
  if not found then return false; end if;
  update public.invoices i set near_registration_status='submitting'
  from public.near_invoice_registration_outbox o where o.id=p_id and i.id=o.invoice_id;
  return true;
end;
$$;

create function public.finish_near_invoice_registration(
  p_id uuid, p_lock_token uuid, p_transaction_hash text, p_invoice_reference text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_invoice_id uuid;
begin
  update public.near_invoice_registration_outbox set status='registered',
    near_transaction_hash=p_transaction_hash, onchain_invoice_reference=p_invoice_reference,
    submitted_at=coalesce(submitted_at,statement_timestamp()), registered_at=statement_timestamp(),
    failure_reason=null, lock_token=null, locked_until=null, updated_at=statement_timestamp()
  where id=p_id and status='processing' and lock_token=p_lock_token
  returning invoice_id into v_invoice_id;
  if not found then return false; end if;
  update public.invoices set near_registration_status='registered',
    near_registration_transaction_hash=p_transaction_hash,
    near_invoice_reference=p_invoice_reference, near_registered_at=statement_timestamp(),
    near_registration_failure_reason=null
  where id=v_invoice_id;
  return true;
end;
$$;

create function public.retry_near_invoice_registration(p_id uuid,p_lock_token uuid,p_failure_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_invoice_id uuid; v_terminal boolean;
begin
  update public.near_invoice_registration_outbox set
    status=case when attempt_count >= 8 then 'failed' else 'pending' end,
    next_attempt_at=statement_timestamp()+make_interval(secs=>least(3600,power(2,least(attempt_count,11))::integer)),
    failure_reason=left(coalesce(nullif(p_failure_reason,''),'near_registration_failed'),96),
    lock_token=null,locked_until=null,updated_at=statement_timestamp()
  where id=p_id and status='processing' and lock_token=p_lock_token
  returning invoice_id,status='failed' into v_invoice_id,v_terminal;
  if not found then return false; end if;
  update public.invoices set near_registration_status=case when v_terminal then 'failed' else 'pending' end,
    near_registration_failure_reason=left(coalesce(nullif(p_failure_reason,''),'near_registration_failed'),96)
  where id=v_invoice_id;
  return true;
end;
$$;

create function public.fail_near_invoice_registration(p_id uuid,p_lock_token uuid,p_failure_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_invoice_id uuid;
begin
  update public.near_invoice_registration_outbox set status='failed',
    failure_reason=left(coalesce(nullif(p_failure_reason,''),'near_registration_failed'),96),
    lock_token=null,locked_until=null,updated_at=statement_timestamp()
  where id=p_id and status='processing' and lock_token=p_lock_token returning invoice_id into v_invoice_id;
  if not found then return false; end if;
  update public.invoices set near_registration_status='failed',
    near_registration_failure_reason=left(coalesce(nullif(p_failure_reason,''),'near_registration_failed'),96)
  where id=v_invoice_id;
  return true;
end;
$$;

create function public.requeue_near_invoice_registration(p_invoice_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.near_invoice_registration_outbox set status='pending', attempt_count=0,
    next_attempt_at=statement_timestamp(), failure_reason=null, lock_token=null, locked_until=null,
    updated_at=statement_timestamp()
  where invoice_id=p_invoice_id and status='failed' and near_transaction_hash is null;
  if not found then return false; end if;
  update public.invoices set near_registration_status='pending',near_registration_failure_reason=null
  where id=p_invoice_id;
  return true;
end;
$$;

revoke all on function public.claim_near_invoice_registration_outbox(integer) from public,anon,authenticated;
revoke all on function public.finish_near_invoice_registration(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.mark_near_invoice_registration_submitted(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.retry_near_invoice_registration(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.fail_near_invoice_registration(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.requeue_near_invoice_registration(uuid) from public,anon,authenticated;
grant execute on function public.claim_near_invoice_registration_outbox(integer) to service_role;
grant execute on function public.finish_near_invoice_registration(uuid,uuid,text,text) to service_role;
grant execute on function public.mark_near_invoice_registration_submitted(uuid,uuid,text) to service_role;
grant execute on function public.retry_near_invoice_registration(uuid,uuid,text) to service_role;
grant execute on function public.fail_near_invoice_registration(uuid,uuid,text) to service_role;
grant execute on function public.requeue_near_invoice_registration(uuid) to service_role;
