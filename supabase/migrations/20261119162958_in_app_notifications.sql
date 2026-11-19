-- Phase 1: In-app notification backend for business owners.
-- When an invoice transitions to 'paid', its business owner receives exactly one persistent notification.
-- Notifications are decoupled and isolated from payment settlement. A notification failure never fails the payment.

-- 1. Notifications table
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  type text not null check (char_length(btrim(type)) between 1 and 64),
  title text not null check (char_length(btrim(title)) between 1 and 255),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  invoice_id uuid references public.invoices(id) on delete cascade,
  destination_url text check (destination_url is null or char_length(destination_url) <= 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_recipient_invoice_type_unique unique (recipient_user_id, invoice_id, type)
);

-- 2. Indexes for querying user's notifications and unread counts
create index notifications_recipient_created_idx
  on public.notifications (recipient_user_id, created_at desc, id desc);

create index notifications_recipient_unread_idx
  on public.notifications (recipient_user_id, created_at desc)
  where read_at is null;

create index notifications_business_created_idx
  on public.notifications (business_id, created_at desc);

create index notifications_invoice_id_idx
  on public.notifications (invoice_id);

-- 3. Row Level Security
alter table public.notifications enable row level security;

-- Authenticated business owners can only view notifications destined for them
create policy "Users can view their own notifications"
  on public.notifications
  for select
  to authenticated
  using (recipient_user_id = (select auth.uid()));

-- Authenticated business owners can update only their own notifications
create policy "Users can update their own notification read status"
  on public.notifications
  for update
  to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));

-- Prevent ordinary clients from inserting or deleting notifications
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- 4. Defense-in-depth trigger guard: restrict updates strictly to read_at
create or replace function public.guard_notification_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.recipient_user_id is distinct from old.recipient_user_id
      or new.business_id is distinct from old.business_id
      or new.type is distinct from old.type
      or new.title is distinct from old.title
      or new.message is distinct from old.message
      or new.invoice_id is distinct from old.invoice_id
      or new.destination_url is distinct from old.destination_url
      or new.created_at is distinct from old.created_at then
      raise exception 'Only read_at can be updated on notifications';
    end if;
  end if;
  return new;
end;
$$;

create trigger notifications_update_guard
  before update on public.notifications
  for each row
  execute function public.guard_notification_changes();

-- 5. Trigger function to emit notification when an invoice is marked paid
create or replace function public.create_invoice_paid_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_user_id uuid;
  v_business_id uuid;
  v_title text;
  v_message text;
  v_amount_text text;
  v_url text;
begin
  -- Critical isolation requirement: Notification insertion errors must not roll back
  -- or prevent the invoice from becoming paid. Any error inside this block is safely
  -- caught and logged as a warning without breaking the verified payment transaction.
  begin
    if old.status is distinct from 'paid' and new.status = 'paid' then
      -- Resolve business owner for this invoice
      select bp.owner_user_id, bp.id
      into v_recipient_user_id, v_business_id
      from public.business_profiles bp
      where bp.id = new.business_id;

      if v_recipient_user_id is not null then
        if new.amount_minor is not null and new.currency is not null then
          v_amount_text := trim(to_char(new.amount_minor::numeric / 100.0, 'FM999,999,999,990.00')) || ' ' || new.currency;
        else
          v_amount_text := 'amount confirmed';
        end if;

        v_title := 'Payment received for ' || coalesce(new.invoice_number, 'invoice');
        v_message := 'Invoice ' || coalesce(new.invoice_number, '') || ' was paid (' || v_amount_text || ').';
        v_url := '/dashboard/invoices/' || new.id::text;

        insert into public.notifications (
          recipient_user_id,
          business_id,
          type,
          title,
          message,
          invoice_id,
          destination_url
        ) values (
          v_recipient_user_id,
          v_business_id,
          'invoice_paid',
          v_title,
          v_message,
          new.id,
          v_url
        ) on conflict (recipient_user_id, invoice_id, type) do nothing;
      end if;
    end if;
  exception when others then
    -- Safe isolation: log warning, never abort the parent invoice update or verified settlement
    raise warning 'create_invoice_paid_notification failed for invoice %: % (%)',
      new.id, sqlerrm, sqlstate;
  end;

  return new;
end;
$$;

-- Revoke execute on trigger functions from public/anon/authenticated (cannot be invoked via PostgREST RPC)
revoke execute on function public.guard_notification_changes() from public, anon, authenticated;
revoke execute on function public.create_invoice_paid_notification() from public, anon, authenticated;

-- 6. Trigger on invoices table
create trigger on_invoice_paid_notification
  after update of status on public.invoices
  for each row
  when (old.status is distinct from 'paid' and new.status = 'paid')
  execute function public.create_invoice_paid_notification();

-- 7. Add to supabase_realtime publication if available
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;
