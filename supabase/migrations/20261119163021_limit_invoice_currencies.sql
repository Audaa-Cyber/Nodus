-- Nodus invoice denomination is limited to supported stablecoins.
-- Existing invoices retain their recorded currency to avoid silently changing historical amounts.
alter table public.business_profiles
  alter column default_currency set default 'USDC';

update public.business_profiles
set default_currency = 'USDC'
where default_currency is null
   or upper(default_currency) not in ('USDC', 'USDT', 'EURC');
