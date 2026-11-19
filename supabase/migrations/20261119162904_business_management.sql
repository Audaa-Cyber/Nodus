create extension if not exists pgcrypto;

create type public.invoice_status as enum ('draft', 'open', 'paid', 'cancelled', 'overdue');

create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  business_name text not null check (char_length(btrim(business_name)) between 1 and 120),
  email text not null check (char_length(email) between 3 and 320),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  invoice_number text not null check (char_length(btrim(invoice_number)) between 1 and 64),
  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 160),
  customer_email text check (customer_email is null or (char_length(customer_email) between 3 and 320 and customer_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  description text not null check (char_length(btrim(description)) between 1 and 2000),
  amount_minor bigint not null check (amount_minor between 1 and 999999999999),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  issue_date date not null,
  due_date date check (due_date is null or due_date >= issue_date),
  status public.invoice_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, invoice_number)
);

create index invoices_business_created_idx on public.invoices (business_id, created_at desc, id desc);
create index invoices_business_status_idx on public.invoices (business_id, status);
create index invoices_business_due_date_idx on public.invoices (business_id, due_date) where status in ('open', 'overdue');

create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger business_profiles_updated_at before update on public.business_profiles
for each row execute function public.set_updated_at();
create trigger invoices_updated_at before update on public.invoices
for each row execute function public.set_updated_at();

-- A verified auth user gets exactly one business profile. User metadata is used only
-- during registration; ownership always comes from auth.uid(), never client input.
create function public.create_business_profile_for_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.business_profiles (owner_user_id, business_name, email)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'business_name'), ''), 'My business'),
    new.email
  ) on conflict (owner_user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_business
after insert on auth.users
for each row execute function public.create_business_profile_for_user();

insert into public.business_profiles (owner_user_id, business_name, email)
select id, coalesce(nullif(btrim(raw_user_meta_data ->> 'business_name'), ''), 'My business'), email
from auth.users
where email is not null
on conflict (owner_user_id) do nothing;

create function public.sync_business_profile_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.business_profiles set email = new.email where owner_user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
after update of email on auth.users
for each row execute function public.sync_business_profile_email();

-- Never allow business-facing authenticated clients to mark an invoice paid.
-- A later payment phase must extend this guard for its verified settlement path.
create function public.guard_invoice_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'open') then
      raise exception 'Invoices can only be created as draft or open';
    end if;
    return new;
  end if;

  if old.status = 'paid' or new.status = 'paid' then
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

create trigger invoices_status_guard before insert or update on public.invoices
for each row execute function public.guard_invoice_changes();

alter table public.business_profiles enable row level security;
alter table public.invoices enable row level security;

create policy "Owners can view their business profile" on public.business_profiles
for select to authenticated using (owner_user_id = (select auth.uid()));
create policy "Owners can update their business profile" on public.business_profiles
for update to authenticated using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

create policy "Owners can view their invoices" on public.invoices
for select to authenticated using (
  exists (select 1 from public.business_profiles bp where bp.id = business_id and bp.owner_user_id = (select auth.uid()))
);
create policy "Owners can create their invoices" on public.invoices
for insert to authenticated with check (
  exists (select 1 from public.business_profiles bp where bp.id = business_id and bp.owner_user_id = (select auth.uid()))
);
create policy "Owners can update their invoices" on public.invoices
for update to authenticated using (
  exists (select 1 from public.business_profiles bp where bp.id = business_id and bp.owner_user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.business_profiles bp where bp.id = business_id and bp.owner_user_id = (select auth.uid()))
);

grant select on public.business_profiles to authenticated;
revoke update on public.business_profiles from authenticated;
grant update (business_name) on public.business_profiles to authenticated;
grant select, insert, update on public.invoices to authenticated;

