-- Merchant-visible projection for NEAR reconciliation progress.
-- The source outbox remains service_role-only; this table contains no evidence
-- payloads, proofs, signer data, or customer data.
create table if not exists public.near_reconciliation_status (
  reconciliation_id uuid primary key,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'processing', 'retrying', 'submitted', 'blocked')),
  near_transaction_hash text,
  updated_at timestamptz not null default statement_timestamp()
);

alter table public.near_reconciliation_status enable row level security;
revoke all on public.near_reconciliation_status from public, anon;
grant select on public.near_reconciliation_status to authenticated;

drop policy if exists "Business owners can view NEAR reconciliation status" on public.near_reconciliation_status;
create policy "Business owners can view NEAR reconciliation status"
  on public.near_reconciliation_status
  for select to authenticated
  using (exists (
    select 1 from public.business_profiles bp
    where bp.id = business_id and bp.owner_user_id = (select auth.uid())
  ));

create or replace function public.sync_near_reconciliation_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.near_reconciliation_status where reconciliation_id = old.reconciliation_id;
    return old;
  end if;

  insert into public.near_reconciliation_status (
    reconciliation_id, invoice_id, business_id, status, near_transaction_hash, updated_at
  )
  select new.reconciliation_id, new.invoice_id, i.business_id,
    case when new.status = 'pending' and new.last_error_code is not null then 'retrying' else new.status end,
    case when new.status = 'submitted' then new.near_transaction_hash else null end,
    statement_timestamp()
  from public.invoices i
  where i.id = new.invoice_id
  on conflict (reconciliation_id) do update set
    invoice_id = excluded.invoice_id,
    business_id = excluded.business_id,
    status = excluded.status,
    near_transaction_hash = excluded.near_transaction_hash,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger if exists near_settlement_status_projection on public.near_settlement_outbox;
create trigger near_settlement_status_projection
after insert or update or delete
on public.near_settlement_outbox
for each row execute function public.sync_near_reconciliation_status();

revoke all on function public.sync_near_reconciliation_status() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'near_reconciliation_status'
    ) then
    alter publication supabase_realtime add table public.near_reconciliation_status;
  end if;
end $$;

insert into public.near_reconciliation_status (
  reconciliation_id, invoice_id, business_id, status, near_transaction_hash, updated_at
)
select o.reconciliation_id, o.invoice_id, i.business_id,
  case when o.status = 'pending' and o.last_error_code is not null then 'retrying' else o.status end,
  case when o.status = 'submitted' then o.near_transaction_hash else null end,
  statement_timestamp()
from public.near_settlement_outbox o
join public.invoices i on i.id = o.invoice_id
on conflict (reconciliation_id) do update set
  invoice_id = excluded.invoice_id,
  business_id = excluded.business_id,
  status = excluded.status,
  near_transaction_hash = excluded.near_transaction_hash,
  updated_at = excluded.updated_at;
