-- Payer-facing invoice context and payment-attempt destination binding.

create or replace function public.lookup_shared_payment_context(p_token_hash text)
returns table (
  invoice_id uuid,
  business_id uuid,
  invoice_number text,
  business_name text,
  amount_minor bigint,
  currency text,
  invoice_status public.invoice_status,
  receiving_address text,
  receiving_network text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    i.id,
    i.business_id,
    i.invoice_number,
    bp.business_name,
    i.amount_minor,
    i.currency,
    case
      when i.status = 'open' and i.due_date < current_date then 'overdue'::public.invoice_status
      else i.status
    end,
    coalesce(i.payment_receiving_address, bp.receiving_address),
    coalesce(i.payment_networks[1], bp.receiving_network)
  from public.invoices i
  join public.business_profiles bp on bp.id = i.business_id
  where p_token_hash ~ '^[0-9a-f]{64}$'
    and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  limit 1;
$function$;

create or replace function public.lookup_shared_payment_networks(p_token_hash text)
returns table (
  invoice_id uuid,
  receiving_address text,
  receiving_networks text[]
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    i.id,
    coalesce(i.payment_receiving_address, bp.receiving_address),
    coalesce(nullif(i.payment_networks, '{}'::text[]), bp.receiving_networks)
  from public.invoices i
  join public.business_profiles bp on bp.id = i.business_id
  where p_token_hash ~ '^[0-9a-f]{64}$'
    and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
    and i.status in ('open','overdue')
  limit 1;
$function$;
revoke all on function public.lookup_shared_payment_networks(text) from public;
grant execute on function public.lookup_shared_payment_networks(text) to anon, authenticated;

create or replace function public.guard_invoice_changes()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft','open') then
      raise exception 'Invoices can only be created as draft or open';
    end if;
    return new;
  end if;

  if old.status <> 'draft'
    and row(new.payment_networks, new.payment_receiving_address)
      is distinct from row(old.payment_networks, old.payment_receiving_address) then
    raise exception 'Invoice payment destination is immutable after issue';
  end if;

  if old.status = 'paid' then
    if current_user <> 'postgres' then
      raise exception 'Paid invoices cannot be changed';
    end if;
    if row(
      new.id,new.business_id,new.invoice_number,new.customer_name,new.customer_email,
      new.description,new.amount_minor,new.currency,new.issue_date,new.due_date,new.status,
      new.created_at,new.updated_at,new.line_items,new.subtotal_minor,new.tax_rate_bps,
      new.discount_minor,new.invoice_footer,new.seller_snapshot,
      new.payment_networks,new.payment_receiving_address
    ) is distinct from row(
      old.id,old.business_id,old.invoice_number,old.customer_name,old.customer_email,
      old.description,old.amount_minor,old.currency,old.issue_date,old.due_date,old.status,
      old.created_at,old.updated_at,old.line_items,old.subtotal_minor,old.tax_rate_bps,
      old.discount_minor,old.invoice_footer,old.seller_snapshot,
      old.payment_networks,old.payment_receiving_address
    ) then
      raise exception 'Paid invoices cannot be changed';
    end if;
    return new;
  end if;

  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'Cancelled invoices cannot be reopened';
  end if;
  if new.status = 'overdue' and (new.due_date is null or new.due_date >= current_date) then
    raise exception 'Only invoices past their due date can be overdue';
  end if;
  if old.status = 'draft' and new.status not in ('draft','open','cancelled') then
    raise exception 'Invalid invoice status transition';
  end if;
  if new.status = 'paid' and (
    current_user <> 'postgres'
    or current_setting('nodus.payment_reconciliation', true) is distinct from 'verified'
  ) then
    raise exception 'Paid status requires verified settlement';
  end if;
  if old.status = 'open' and new.status not in ('open','overdue','cancelled','paid') then
    raise exception 'Invalid invoice status transition';
  end if;
  if old.status = 'overdue' and new.status not in ('overdue','open','cancelled','paid') then
    raise exception 'Invalid invoice status transition';
  end if;
  return new;
end;
$function$;

create or replace function public.create_committed_payment_attempt(
  p_token_hash text,
  p_idempotency_key uuid,
  p_source_asset_id text,
  p_source_network text,
  p_destination_asset_id text,
  p_destination_network text,
  p_recipient_address text,
  p_requested_amount text,
  p_expected_received_amount text,
  p_deposit_address text,
  p_deposit_memo text,
  p_quote_expires_at timestamp with time zone,
  p_quote_snapshot jsonb
)
returns setof public.payment_attempts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_context record;
  v_invoice public.invoices%rowtype;
begin
  select * into v_context
  from public.lookup_shared_payment_context(p_token_hash);

  if not found or v_context.invoice_status not in ('open','overdue') then
    raise exception 'invoice_unavailable' using errcode = 'P0002';
  end if;

  if p_requested_amount !~ '^[0-9]+$'
    or p_expected_received_amount !~ '^[0-9]+([.][0-9]+)?$'
    or p_quote_snapshot is null
    or p_deposit_address is null then
    raise exception 'invalid_quote_snapshot' using errcode = '22023';
  end if;

  select * into v_invoice
  from public.invoices
  where id = v_context.invoice_id
  for update;

  if not found or v_invoice.status not in ('open','overdue') then
    raise exception 'invoice_unavailable' using errcode = 'P0002';
  end if;

  if p_source_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    or p_destination_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    or p_source_asset_id <> p_source_network || ':usdc'
    or p_destination_asset_id <> p_destination_network || ':usdc'
    or not (p_destination_network = any(v_invoice.payment_networks))
    or p_recipient_address is null
    or lower(p_recipient_address) <> lower(coalesce(v_invoice.payment_receiving_address, '')) then
    raise exception 'invoice_payment_terms_mismatch' using errcode = '22023';
  end if;

  return query
  select pa.*
  from public.payment_attempts pa
  where pa.invoice_id = v_invoice.id
    and pa.idempotency_key = p_idempotency_key
    and pa.status in ('PENDING_DEPOSIT','PROCESSING','KNOWN_DEPOSIT_TX');
  if found then
    return;
  end if;

  update public.payment_attempts pa
  set status = 'QUOTE_EXPIRED',
      circle_recovery_updated_at = statement_timestamp()
  where pa.invoice_id = v_invoice.id
    and pa.mode = 'live'
    and pa.status in ('PENDING_DEPOSIT','MOCK_QUOTE_READY')
    and pa.quote_expires_at is not null
    and pa.quote_expires_at <= statement_timestamp()
    and pa.circle_execution_reserved_at is null
    and pa.transaction_hash is null
    and pa.circle_approval_tx_hash is null
    and pa.settlement_resolved_at is null;

  if exists (
    select 1 from public.payment_attempts pa
    where pa.invoice_id = v_invoice.id
      and (
        pa.status in ('MOCK_QUOTE_READY','PENDING_DEPOSIT','KNOWN_DEPOSIT_TX','PROCESSING')
        or (pa.mode = 'live' and pa.status = 'SUCCESS')
      )
  ) then
    raise exception 'active_payment_attempt_exists' using errcode = '23505';
  end if;

  return query
  insert into public.payment_attempts (
    invoice_id,business_id,mode,source_asset_id,source_network,
    destination_asset_id,destination_network,recipient_address,idempotency_key,
    requested_amount,expected_received_amount,deposit_address,deposit_memo,
    quote_expires_at,quote_snapshot,status
  ) values (
    v_invoice.id,v_invoice.business_id,'live',p_source_asset_id,p_source_network,
    p_destination_asset_id,p_destination_network,p_recipient_address,p_idempotency_key,
    p_requested_amount,p_expected_received_amount,p_deposit_address,p_deposit_memo,
    p_quote_expires_at,p_quote_snapshot,'PENDING_DEPOSIT'
  )
  returning *;
end;
$function$;
