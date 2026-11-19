-- Business controlled receiving destination and isolated payment preparation attempts.
alter table public.invoices add constraint invoices_id_business_unique unique (id, business_id);
alter table public.business_profiles
  add column receiving_address text,
  add column receiving_network text,
  add constraint business_receiving_destination_pair
    check ((receiving_address is null and receiving_network is null)
      or (receiving_address is not null and receiving_network is not null)),
  add constraint business_receiving_address_length
    check (receiving_address is null or char_length(btrim(receiving_address)) between 1 and 256),
  add constraint business_receiving_network_format
    check (receiving_network is null or receiving_network ~ '^[a-z0-9:_-]{1,64}$');
grant update (receiving_address, receiving_network) on public.business_profiles to authenticated;

create type public.payment_attempt_status as enum (
  'MOCK_QUOTE_READY', 'QUOTE_EXPIRED', 'PENDING_DEPOSIT', 'KNOWN_DEPOSIT_TX', 'PROCESSING',
  'SUCCESS', 'REFUNDED', 'FAILED', 'INCOMPLETE_DEPOSIT'
);

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  business_id uuid not null references public.business_profiles(id) on delete restrict,
  mode text not null check (mode in ('mock', 'live')),
  source_asset_id text not null check (char_length(source_asset_id) between 1 and 240),
  source_network text not null check (char_length(source_network) between 1 and 64),
  destination_asset_id text not null check (char_length(destination_asset_id) between 1 and 240),
  destination_network text not null check (char_length(destination_network) between 1 and 64),
  recipient_address text,
  deposit_memo text,
  idempotency_key uuid not null,
  requested_amount text check (requested_amount is null or requested_amount ~ '^[0-9]+$'),
  expected_received_amount text check (expected_received_amount is null or expected_received_amount ~ '^[0-9]+([.][0-9]+)?$'),
  deposit_address text,
  quote_expires_at timestamptz,
  transaction_hash text,
  quote_snapshot jsonb,
  status public.payment_attempt_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_attempt_idempotency_unique unique (invoice_id, idempotency_key),
  constraint payment_attempt_invoice_business_fk foreign key (invoice_id, business_id)
    references public.invoices(id, business_id) deferrable initially immediate
);

create index payment_attempts_invoice_created_idx on public.payment_attempts(invoice_id, created_at desc);
create unique index payment_attempts_one_active_per_invoice
  on public.payment_attempts(invoice_id)
  where status in ('MOCK_QUOTE_READY', 'PENDING_DEPOSIT', 'KNOWN_DEPOSIT_TX', 'PROCESSING')
    or (mode = 'live' and status = 'SUCCESS');

create trigger payment_attempts_updated_at before update on public.payment_attempts
for each row execute function public.set_updated_at();

alter table public.payment_attempts enable row level security;
create policy "Business owners can view payment attempts" on public.payment_attempts
for select to authenticated using (
  exists (select 1 from public.business_profiles bp
    where bp.id = business_id and bp.owner_user_id = (select auth.uid()))
);
revoke all on public.payment_attempts from public, anon, authenticated;
grant select on public.payment_attempts to authenticated;

-- Public mock writes are restricted to payable shared invoices and a narrow transition set.
create function public.create_mock_payment_attempt(
  p_token_hash text, p_idempotency_key uuid, p_source_asset_id text, p_source_network text
) returns setof public.payment_attempts
language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices%rowtype;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_source_asset_id !~ '^[A-Za-z0-9:_./-]{1,240}$'
    or p_source_network !~ '^[a-z0-9:_-]{1,64}$' then
    raise exception 'invalid_mock_request' using errcode = '22023';
  end if;
  select i.* into v_invoice from public.invoices i
    where i.share_token_hash = p_token_hash
      and i.share_token_expires_at > statement_timestamp()
      and i.status in ('open', 'overdue')
    limit 1;
  if not found then raise exception 'invoice_unavailable' using errcode = 'P0002'; end if;

  return query select pa.* from public.payment_attempts pa
    where pa.invoice_id = v_invoice.id and pa.idempotency_key = p_idempotency_key;
  if found then return; end if;

  return query select pa.* from public.payment_attempts pa
    where pa.invoice_id = v_invoice.id and pa.status in ('MOCK_QUOTE_READY','PENDING_DEPOSIT','KNOWN_DEPOSIT_TX','PROCESSING')
    order by pa.created_at desc limit 1;
  if found then return; end if;

  return query insert into public.payment_attempts (
    invoice_id, business_id, mode, source_asset_id, source_network,
    destination_asset_id, destination_network, recipient_address,
    idempotency_key, status
  ) values (v_invoice.id, v_invoice.business_id, 'mock', p_source_asset_id,
    p_source_network, 'simulation:usdc:base', 'base', null,
    p_idempotency_key, 'MOCK_QUOTE_READY')
  on conflict (invoice_id, idempotency_key) do update set updated_at = public.payment_attempts.updated_at
  returning *;
end;
$$;

create function public.advance_mock_payment_attempt(
  p_token_hash text, p_attempt_id uuid, p_next_status public.payment_attempt_status
) returns setof public.payment_attempts
language plpgsql security definer set search_path = '' as $$
declare v_invoice_id uuid; v_current public.payment_attempt_status;
begin
  select i.id, pa.status into v_invoice_id, v_current
    from public.payment_attempts pa join public.invoices i on i.id = pa.invoice_id
    where pa.id = p_attempt_id and pa.mode = 'mock' and i.share_token_hash = p_token_hash
      and i.share_token_expires_at > statement_timestamp();
  if not found then raise exception 'attempt_unavailable' using errcode = 'P0002'; end if;
  if not ((v_current = 'MOCK_QUOTE_READY' and p_next_status in ('PENDING_DEPOSIT','QUOTE_EXPIRED'))
    or (v_current = 'PENDING_DEPOSIT' and p_next_status in ('KNOWN_DEPOSIT_TX','FAILED','REFUNDED','INCOMPLETE_DEPOSIT'))
    or (v_current = 'KNOWN_DEPOSIT_TX' and p_next_status in ('PROCESSING','FAILED','REFUNDED','INCOMPLETE_DEPOSIT'))
    or (v_current = 'PROCESSING' and p_next_status in ('SUCCESS','FAILED','REFUNDED','INCOMPLETE_DEPOSIT'))) then
    raise exception 'invalid_status_transition' using errcode = '22023';
  end if;
  return query update public.payment_attempts set status = p_next_status
    where id = p_attempt_id and invoice_id = v_invoice_id returning *;
end;
$$;

create function public.lookup_shared_payment_context(p_token_hash text)
returns table (
  invoice_id uuid, business_id uuid, invoice_number text, business_name text,
  amount_minor bigint, currency text, invoice_status public.invoice_status,
  receiving_address text, receiving_network text
)
language sql stable security definer set search_path = '' as $$
  select i.id, i.business_id, i.invoice_number, bp.business_name,
    i.amount_minor, i.currency,
    case when i.status = 'open' and i.due_date < current_date then 'overdue'::public.invoice_status else i.status end,
    bp.receiving_address, bp.receiving_network
  from public.invoices i join public.business_profiles bp on bp.id = i.business_id
  where p_token_hash ~ '^[0-9a-f]{64}$' and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  limit 1;
$$;

create function public.create_committed_payment_attempt(
  p_token_hash text, p_idempotency_key uuid, p_source_asset_id text, p_source_network text,
  p_destination_asset_id text, p_destination_network text, p_recipient_address text,
  p_requested_amount text, p_expected_received_amount text, p_deposit_address text,
  p_deposit_memo text, p_quote_expires_at timestamptz, p_quote_snapshot jsonb
) returns setof public.payment_attempts
language plpgsql security definer set search_path = '' as $$
declare v_context record;
begin
  select * into v_context from public.lookup_shared_payment_context(p_token_hash);
  if not found or v_context.invoice_status not in ('open','overdue') then
    raise exception 'invoice_unavailable' using errcode = 'P0002';
  end if;
  if p_requested_amount !~ '^[0-9]+$' or p_expected_received_amount !~ '^[0-9]+([.][0-9]+)?$'
    or p_quote_snapshot is null or p_deposit_address is null then
    raise exception 'invalid_quote_snapshot' using errcode = '22023';
  end if;
  if exists (select 1 from public.payment_attempts pa where pa.invoice_id = v_context.invoice_id
      and (pa.status in ('MOCK_QUOTE_READY','PENDING_DEPOSIT','KNOWN_DEPOSIT_TX','PROCESSING')
        or (pa.mode = 'live' and pa.status = 'SUCCESS'))) then
    raise exception 'active_payment_attempt_exists' using errcode = '23505';
  end if;
  return query insert into public.payment_attempts (
    invoice_id, business_id, mode, source_asset_id, source_network,
    destination_asset_id, destination_network, recipient_address, idempotency_key,
    requested_amount, expected_received_amount, deposit_address, deposit_memo,
    quote_expires_at, quote_snapshot, status
  ) values (v_context.invoice_id, v_context.business_id, 'live', p_source_asset_id,
    p_source_network, p_destination_asset_id, p_destination_network, p_recipient_address,
    p_idempotency_key, p_requested_amount, p_expected_received_amount, p_deposit_address,
    p_deposit_memo, p_quote_expires_at, p_quote_snapshot, 'PENDING_DEPOSIT')
  returning *;
end;
$$;

create function public.get_shared_live_attempt(p_token_hash text, p_attempt_id uuid)
returns setof public.payment_attempts
language sql stable security definer set search_path = '' as $$
  select pa.* from public.payment_attempts pa
  join public.invoices i on i.id = pa.invoice_id
  where pa.id = p_attempt_id and pa.mode = 'live'
    and i.share_token_hash = p_token_hash and i.share_token_expires_at > statement_timestamp()
  limit 1;
$$;

create function public.update_live_attempt_status(
  p_token_hash text, p_attempt_id uuid, p_status public.payment_attempt_status, p_transaction_hash text default null
) returns setof public.payment_attempts
language plpgsql security definer set search_path = '' as $$
declare v_current public.payment_attempt_status;
begin
  select pa.status into v_current from public.payment_attempts pa
  join public.invoices i on i.id = pa.invoice_id
  where pa.id = p_attempt_id and pa.mode = 'live' and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp();
  if not found then raise exception 'attempt_unavailable' using errcode = 'P0002'; end if;
  if v_current in ('SUCCESS','REFUNDED','FAILED','INCOMPLETE_DEPOSIT') then
    return query select * from public.get_shared_live_attempt(p_token_hash, p_attempt_id);
    return;
  end if;
  if p_status not in ('PENDING_DEPOSIT','KNOWN_DEPOSIT_TX','PROCESSING','SUCCESS','REFUNDED','FAILED','INCOMPLETE_DEPOSIT') then
    raise exception 'invalid_live_status' using errcode = '22023';
  end if;
  return query update public.payment_attempts set status = p_status,
    transaction_hash = coalesce(p_transaction_hash, transaction_hash)
    where id = p_attempt_id returning *;
end;
$$;

create function public.close_live_attempt(
  p_token_hash text, p_attempt_id uuid, p_status public.payment_attempt_status
) returns setof public.payment_attempts
language plpgsql security definer set search_path = '' as $$
declare v_attempt public.payment_attempts%rowtype;
begin
  select pa.* into v_attempt from public.payment_attempts pa
  join public.invoices i on i.id = pa.invoice_id
  where pa.id = p_attempt_id and pa.mode = 'live' and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  for update of pa;
  if not found then raise exception 'attempt_unavailable' using errcode = 'P0002'; end if;
  if v_attempt.transaction_hash is not null then
    raise exception 'deposit_already_submitted' using errcode = '22023';
  end if;
  if p_status = 'QUOTE_EXPIRED' then
    if v_attempt.quote_expires_at > statement_timestamp() then
      raise exception 'quote_not_expired' using errcode = '22023';
    end if;
  elsif p_status <> 'FAILED' then
    raise exception 'invalid_close_status' using errcode = '22023';
  end if;
  return query update public.payment_attempts set status = p_status where id = p_attempt_id returning *;
end;
$$;

revoke all on function public.create_mock_payment_attempt(text, uuid, text, text) from public, authenticated;
revoke all on function public.advance_mock_payment_attempt(text, uuid, public.payment_attempt_status) from public, authenticated;
revoke all on function public.lookup_shared_payment_context(text) from public, authenticated;
revoke all on function public.create_committed_payment_attempt(text, uuid, text, text, text, text, text, text, text, text, text, timestamptz, jsonb) from public, authenticated;
revoke all on function public.get_shared_live_attempt(text, uuid) from public, authenticated;
revoke all on function public.update_live_attempt_status(text, uuid, public.payment_attempt_status, text) from public, authenticated;
revoke all on function public.close_live_attempt(text, uuid, public.payment_attempt_status) from public, authenticated;
grant execute on function public.create_mock_payment_attempt(text, uuid, text, text) to anon;
grant execute on function public.advance_mock_payment_attempt(text, uuid, public.payment_attempt_status) to anon;
grant execute on function public.lookup_shared_payment_context(text) to anon;
grant execute on function public.create_committed_payment_attempt(text, uuid, text, text, text, text, text, text, text, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.get_shared_live_attempt(text, uuid) to service_role;
grant execute on function public.update_live_attempt_status(text, uuid, public.payment_attempt_status, text) to service_role;
grant execute on function public.close_live_attempt(text, uuid, public.payment_attempt_status) to service_role;
