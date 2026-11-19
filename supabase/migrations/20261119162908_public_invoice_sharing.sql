-- Public invoice links are one-year bearer links. Only a SHA-256 digest is stored.
alter table public.invoices
  add column share_token_hash text,
  add column share_token_expires_at timestamptz,
  add constraint invoices_share_token_hash_format
    check (share_token_hash is null or share_token_hash ~ '^[0-9a-f]{64}$'),
  add constraint invoices_share_expiry_requires_token
    check ((share_token_hash is null and share_token_expires_at is null)
      or (share_token_hash is not null and share_token_expires_at is not null));

create unique index invoices_share_token_hash_unique
  on public.invoices (share_token_hash)
  where share_token_hash is not null;

-- Paid invoices may still be shared or have a stale link revoked. Keep all
-- invoice content and status immutable while permitting only link metadata.
create or replace function public.guard_invoice_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'open') then
      raise exception 'Invoices can only be created as draft or open';
    end if;
    return new;
  end if;

  if old.status = 'paid' then
    if row(new.id, new.business_id, new.invoice_number, new.customer_name,
           new.customer_email, new.description, new.amount_minor, new.currency,
           new.issue_date, new.due_date, new.status, new.created_at, new.updated_at)
       is distinct from
       row(old.id, old.business_id, old.invoice_number, old.customer_name,
           old.customer_email, old.description, old.amount_minor, old.currency,
           old.issue_date, old.due_date, old.status, old.created_at, old.updated_at) then
      raise exception 'Paid invoices cannot be changed';
    end if;
    return new;
  end if;

  if new.status = 'paid' then
    raise exception 'Paid status requires verified settlement';
  end if;

  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'Cancelled invoices cannot be reopened';
  end if;

  if new.status = 'overdue' and (new.due_date is null or new.due_date >= current_date) then
    raise exception 'Only invoices past their due date can be overdue';
  end if;

  if old.status = 'draft' and new.status not in ('draft', 'open', 'cancelled') then
    raise exception 'Invalid invoice status transition';
  end if;
  if old.status = 'open' and new.status not in ('open', 'overdue', 'cancelled') then
    raise exception 'Invalid invoice status transition';
  end if;
  if old.status = 'overdue' and new.status not in ('overdue', 'open', 'cancelled') then
    raise exception 'Invalid invoice status transition';
  end if;

  return new;
end;
$$;

-- The only anonymous lookup surface is this narrow RPC. It never returns an
-- internal ID, customer name/email, business ID, token hash, or owner data.
create or replace function public.lookup_shared_invoice(p_token_hash text)
returns table (
  link_status text,
  business_name text,
  invoice_number text,
  description text,
  amount_minor bigint,
  currency text,
  issue_date date,
  due_date date,
  status public.invoice_status,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when i.share_token_expires_at <= statement_timestamp() then 'expired' else 'active' end,
    case when i.share_token_expires_at > statement_timestamp() then bp.business_name else null end,
    case when i.share_token_expires_at > statement_timestamp() then i.invoice_number else null end,
    case when i.share_token_expires_at > statement_timestamp() then i.description else null end,
    case when i.share_token_expires_at > statement_timestamp() then i.amount_minor else null end,
    case when i.share_token_expires_at > statement_timestamp() then i.currency else null end,
    case when i.share_token_expires_at > statement_timestamp() then i.issue_date else null end,
    case when i.share_token_expires_at > statement_timestamp() then i.due_date else null end,
    case when i.share_token_expires_at > statement_timestamp()
      then case when i.status = 'open' and i.due_date < current_date
        then 'overdue'::public.invoice_status else i.status end
      else null
    end,
    i.share_token_expires_at
  from public.invoices as i
  join public.business_profiles as bp on bp.id = i.business_id
  where p_token_hash ~ '^[0-9a-f]{64}$'
    and i.share_token_hash = p_token_hash
  limit 1;
$$;

revoke all on function public.lookup_shared_invoice(text) from public, anon, authenticated;
grant execute on function public.lookup_shared_invoice(text) to anon, authenticated;

-- Public invoice data must not become directly selectable through PostgREST.
revoke all on table public.invoices from public, anon;
