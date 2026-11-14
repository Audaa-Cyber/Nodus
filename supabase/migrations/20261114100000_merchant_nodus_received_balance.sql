-- Aggregate NODUS invoice receipts server-side. The function runs with caller
-- privileges and RLS; no business ID is accepted from the browser.
create or replace function public.merchant_nodus_received_by_chain()
returns table (
  destination_network text,
  total_base_units text,
  payment_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with eligible_settlements as (
    select distinct on (ps.id)
      ps.id,
      ps.destination_network,
      ps.received_amount_base_units
    from public.business_profiles bp
    join public.invoices i
      on i.business_id = bp.id
    join public.payment_attempts pa
      on pa.invoice_id = i.id
     and pa.business_id = bp.id
    join public.payment_settlements ps
      on ps.invoice_id = i.id
     and ps.business_id = bp.id
     and ps.payment_attempt_id = pa.id
    where bp.owner_user_id = auth.uid()
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
      -- These are the networks currently offered in Business Settings for
      -- live USDC checkout. Unsupported chains and wallet transfers are excluded.
      and ps.destination_network in (
        'sepolia', 'base-sepolia', 'arbitrum-sepolia', 'optimism-sepolia'
      )
    order by ps.id
  )
  select
    eligible.destination_network,
    sum(eligible.received_amount_base_units::numeric)::text,
    count(*)::bigint
  from eligible_settlements eligible
  group by eligible.destination_network
  order by eligible.destination_network;
$$;

revoke all on function public.merchant_nodus_received_by_chain() from public, anon;
grant execute on function public.merchant_nodus_received_by_chain() to authenticated;
