-- WorkOS-scoped invoice numbering, merchant settlement totals, notifications, and CCTP reservation.

create or replace function public.allocate_invoice_number(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_prefix text;
  v_sequence bigint;
  v_user_id text;
  v_issuer text;
begin
  v_user_id := auth.jwt() ->> 'sub';
  v_issuer := auth.jwt() ->> 'iss';
  if v_user_id is null or v_user_id = ''
    or v_issuer not in (
      'https://api.workos.com/user_management/client_01M7T841PNMYSWF6CYPTWWK7MH',
      'https://api.workos.com/user_management/client_01M7T841Y5D7AJZHVW8YSTJ9EG'
    ) then
    raise exception 'Not authorized to allocate invoice number';
  end if;

  update public.business_profiles
  set next_invoice_number = next_invoice_number + 1
  where id = p_business_id
    and owner_user_id = v_user_id
  returning invoice_prefix, next_invoice_number - 1 into v_prefix, v_sequence;

  if v_sequence is null then
    raise exception 'Business profile not found';
  end if;
  return v_prefix || '-' || to_char(current_date, 'YYYY') || '-' || lpad(v_sequence::text, 4, '0');
end;
$function$;

create or replace function public.merchant_nodus_received_by_chain()
returns table(destination_network text, total_base_units text, payment_count bigint)
language sql
stable
set search_path = ''
as $function$
  with eligible_settlements as (
    select distinct on (ps.id)
      ps.id, ps.destination_network, ps.received_amount_base_units
    from public.business_profiles bp
    join public.invoices i on i.business_id = bp.id
    join public.payment_attempts pa on pa.invoice_id = i.id and pa.business_id = bp.id
    join public.payment_settlements ps on ps.invoice_id = i.id
      and ps.business_id = bp.id and ps.payment_attempt_id = pa.id
    where bp.owner_user_id = (auth.jwt() ->> 'sub')
      and i.status = 'paid'
      and pa.mode = 'live'
      and pa.status = 'SUCCESS'
      and ps.provider_status = 'SUCCESS'
      and ps.outcome = 'VERIFIED'
      and ps.destination_network = pa.destination_network
      and ps.destination_asset_id = pa.destination_asset_id
      and ps.destination_asset_id = ps.destination_network || ':usdc'
      and ps.received_asset_decimals = 6
      and ps.received_amount_base_units ~ '^[0-9]+$'
      and ps.received_amount_base_units::numeric > 0
      and ps.destination_network in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    order by ps.id
  )
  select
    eligible.destination_network,
    sum(eligible.received_amount_base_units::numeric)::text,
    count(*)::bigint
  from eligible_settlements eligible
  group by eligible.destination_network
  order by eligible.destination_network;
$function$;

create or replace function public.create_invoice_paid_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_recipient_user_id text;
  v_business_id uuid;
  v_title text;
  v_message text;
  v_amount_text text;
  v_url text;
begin
  begin
    if old.status is distinct from 'paid' and new.status = 'paid' then
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
          recipient_user_id,business_id,type,title,message,invoice_id,destination_url
        ) values (
          v_recipient_user_id,v_business_id,'invoice_paid',v_title,v_message,new.id,v_url
        ) on conflict (recipient_user_id, invoice_id, type) do nothing;
      end if;
    end if;
  exception when others then
    raise warning 'create_invoice_paid_notification failed for invoice %: % (%)',
      new.id, sqlerrm, sqlstate;
  end;
  return new;
end;
$function$;

create or replace function public.mark_circle_execution_started(
  p_token_hash text,
  p_attempt_id uuid,
  p_expected_payer text
)
returns setof public.payment_attempts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempt public.payment_attempts%rowtype;
  v_invoice public.invoices%rowtype;
  v_business public.business_profiles%rowtype;
  v_snapshot jsonb;
  v_snapshot_expiry timestamptz;
  v_received numeric;
  v_total_debit numeric;
  v_fee_total numeric;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_expected_payer is null or p_expected_payer !~ '^0x[0-9a-fA-F]{40}$' then
    raise exception 'invalid_execution_reservation_request' using errcode = '22023';
  end if;

  perform 1
  from public.payment_attempts pa
  join public.invoices i on i.id = pa.invoice_id
  join public.business_profiles bp on bp.id = i.business_id
  where pa.id = p_attempt_id
    and pa.mode = 'live'
    and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  for update of pa, i, bp;
  if not found then
    raise exception 'attempt_unavailable' using errcode = 'P0002';
  end if;

  select pa.* into v_attempt from public.payment_attempts pa where pa.id = p_attempt_id;
  select i.* into v_invoice from public.invoices i where i.id = v_attempt.invoice_id;
  select bp.* into v_business from public.business_profiles bp where bp.id = v_invoice.business_id;

  if v_invoice.status not in ('open','overdue') then
    raise exception 'invoice_unavailable' using errcode = 'P0002';
  end if;
  if v_attempt.circle_execution_reserved_at is not null then
    raise exception 'circle_execution_already_reserved' using errcode = '22023';
  end if;
  if v_attempt.status is distinct from 'PENDING_DEPOSIT'
    or v_attempt.circle_recovery_state is distinct from 'AWAITING_SOURCE'
    or v_attempt.transaction_hash is not null
    or v_attempt.settlement_resolved_at is not null then
    raise exception 'invalid_execution_start_state' using errcode = '22023';
  end if;
  if v_attempt.quote_expires_at is null
    or v_attempt.quote_expires_at <= statement_timestamp() then
    raise exception 'quote_expired' using errcode = '22023';
  end if;

  v_snapshot := v_attempt.quote_snapshot;
  if v_snapshot is null or jsonb_typeof(v_snapshot) <> 'object'
    or v_snapshot->>'type' is distinct from 'circle_cctp'
    or v_snapshot->>'invoiceId' is distinct from v_attempt.invoice_id::text
    or v_attempt.business_id is distinct from v_invoice.business_id
    or v_business.id is distinct from v_invoice.business_id
    or v_snapshot->>'invoiceAmountMinor' is distinct from v_invoice.amount_minor::text
    or v_snapshot->>'invoiceCurrency' is distinct from v_invoice.currency
    or v_invoice.currency <> 'USD'
    or lower(coalesce(v_snapshot->>'payer', '')) <> lower(p_expected_payer)
    or v_snapshot->>'sourceNetwork' is distinct from v_attempt.source_network
    or v_snapshot->>'sourceAssetId' is distinct from v_attempt.source_asset_id
    or v_snapshot->>'destinationNetwork' is distinct from v_attempt.destination_network
    or v_snapshot->>'destinationAssetId' is distinct from v_attempt.destination_asset_id
    or v_attempt.recipient_address is null
    or v_invoice.payment_receiving_address is null
    or cardinality(v_invoice.payment_networks) = 0
    or not (v_attempt.destination_network = any(v_invoice.payment_networks))
    or lower(coalesce(v_snapshot->>'recipient', '')) <> lower(v_attempt.recipient_address)
    or lower(v_attempt.recipient_address) is distinct from lower(v_invoice.payment_receiving_address)
    or v_snapshot->>'minimumReceived' is distinct from v_attempt.expected_received_amount
    or v_attempt.expected_received_amount is null
    or v_attempt.requested_amount is null
    or v_attempt.source_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    or v_attempt.source_asset_id <> (v_attempt.source_network || ':usdc')
    or v_attempt.destination_network not in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia','arc-testnet')
    or v_attempt.destination_network = v_attempt.source_network
    or v_attempt.destination_asset_id <> (v_attempt.destination_network || ':usdc')
    or v_attempt.expected_received_amount !~ '^[1-9][0-9]*$'
    or v_attempt.requested_amount !~ '^[1-9][0-9]*$'
    or v_snapshot->>'quote' is null
    or btrim(v_snapshot->>'quote') = '' then
    raise exception 'attempt_quote_binding_mismatch' using errcode = '22023';
  end if;

  begin
    v_snapshot_expiry := nullif(v_snapshot->>'quoteExpiresAt', '')::timestamptz;
    v_received := nullif(v_snapshot->>'amountReceived', '')::numeric;
    v_total_debit := nullif(v_snapshot->>'totalDebit', '')::numeric;
    v_fee_total := nullif(v_snapshot->>'feeTotal', '')::numeric;
  exception when others then
    raise exception 'attempt_quote_binding_mismatch' using errcode = '22023';
  end;

  if v_snapshot_expiry is distinct from v_attempt.quote_expires_at
    or v_received is null
    or v_total_debit is null
    or v_fee_total is null
    or v_attempt.expected_received_amount is null
    or v_attempt.requested_amount is null
    or v_received * 1000000 <> v_attempt.expected_received_amount::numeric
    or v_total_debit * 1000000 <> v_attempt.requested_amount::numeric
    or v_total_debit - v_received <> v_fee_total
    or v_invoice.amount_minor::numeric * 10000 <> v_attempt.expected_received_amount::numeric then
    raise exception 'attempt_quote_binding_mismatch' using errcode = '22023';
  end if;

  perform set_config('nodus.circle_execution_reserving', 'yes', true);
  return query
  update public.payment_attempts pa
  set circle_execution_reserved_at = statement_timestamp(),
      status = 'PROCESSING',
      circle_recovery_state = 'AWAITING_SOURCE',
      circle_recovery_updated_at = statement_timestamp()
  where pa.id = p_attempt_id
    and pa.circle_execution_reserved_at is null
    and pa.status = 'PENDING_DEPOSIT'
  returning pa.*;
end;
$function$;
