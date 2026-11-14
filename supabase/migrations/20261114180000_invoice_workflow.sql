-- Reusable invoice defaults, atomic invoice numbering and itemized invoice totals.
alter table public.business_profiles
 add column if not exists logo_url text,
 add column if not exists invoice_prefix text not null default 'INV',
 add column if not exists next_invoice_number bigint not null default 1,
 add column if not exists default_currency text not null default 'USD',
 add column if not exists default_payment_terms_days integer not null default 14,
 add column if not exists invoice_footer text not null default 'Thank you for your business.';
alter table public.business_profiles
 add constraint business_profiles_logo_url_length check (logo_url is null or char_length(logo_url)<=2048),
 add constraint business_profiles_invoice_prefix_format check (invoice_prefix ~ '^[A-Za-z0-9-]{1,16}$'),
 add constraint business_profiles_next_invoice_number_positive check (next_invoice_number>0),
 add constraint business_profiles_default_currency_format check (default_currency ~ '^[A-Z]{3}$'),
 add constraint business_profiles_payment_terms_range check (default_payment_terms_days between 0 and 365),
 add constraint business_profiles_invoice_footer_length check (char_length(invoice_footer)<=1000);
alter table public.invoices alter column customer_name drop not null;
alter table public.invoices alter column customer_email drop not null;
alter table public.invoices alter column description drop not null;
alter table public.invoices add column if not exists line_items jsonb not null default '[]'::jsonb,
 add column if not exists subtotal_minor bigint,
 add column if not exists tax_rate_bps integer not null default 0,
 add column if not exists discount_minor bigint not null default 0,
 add column if not exists invoice_footer text,
 add column if not exists seller_snapshot jsonb;
alter table public.invoices add constraint invoices_line_items_array check(jsonb_typeof(line_items)='array'),
 add constraint invoices_tax_rate_range check(tax_rate_bps between 0 and 10000),
 add constraint invoices_discount_nonnegative check(discount_minor>=0);
create or replace function public.allocate_invoice_number(p_business_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_prefix text; v_sequence bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.business_profiles bp where bp.id=p_business_id and bp.owner_user_id=auth.uid()) then
   raise exception 'Not authorized to allocate invoice number';
 end if;
 update public.business_profiles set next_invoice_number=next_invoice_number+1 where id=p_business_id
 returning invoice_prefix,next_invoice_number-1 into v_prefix,v_sequence;
 if v_sequence is null then raise exception 'Business profile not found'; end if;
 return v_prefix||'-'||to_char(current_date,'YYYY')||'-'||lpad(v_sequence::text,4,'0');
end; $$;
revoke all on function public.allocate_invoice_number(uuid) from public,anon;
grant execute on function public.allocate_invoice_number(uuid) to authenticated;
drop function if exists public.lookup_shared_invoice(text);
create function public.lookup_shared_invoice(p_token_hash text)
returns table(link_status text,business_name text,invoice_number text,description text,amount_minor bigint,currency text,issue_date date,due_date date,status public.invoice_status,expires_at timestamptz,line_items jsonb,subtotal_minor bigint,tax_rate_bps integer,discount_minor bigint,logo_url text,invoice_footer text)
language sql stable security definer set search_path='' as $$
 select case when i.share_token_expires_at<=statement_timestamp() then 'expired' else 'active' end,
 case when i.share_token_expires_at>statement_timestamp() then bp.business_name else null end,
 case when i.share_token_expires_at>statement_timestamp() then i.invoice_number else null end,
 case when i.share_token_expires_at>statement_timestamp() then i.description else null end,
 case when i.share_token_expires_at>statement_timestamp() then i.amount_minor else null end,
 case when i.share_token_expires_at>statement_timestamp() then i.currency else null end,
 case when i.share_token_expires_at>statement_timestamp() then i.issue_date else null end,
 case when i.share_token_expires_at>statement_timestamp() then i.due_date else null end,
 case when i.share_token_expires_at>statement_timestamp() then case when i.status='open' and i.due_date<current_date then 'overdue'::public.invoice_status else i.status end else null end,
 i.share_token_expires_at,
 case when i.share_token_expires_at>statement_timestamp() then i.line_items else null end,
 case when i.share_token_expires_at>statement_timestamp() then i.subtotal_minor else null end,
 case when i.share_token_expires_at>statement_timestamp() then i.tax_rate_bps else null end,
 case when i.share_token_expires_at>statement_timestamp() then i.discount_minor else null end,
 case when i.share_token_expires_at>statement_timestamp() then bp.logo_url else null end,
 case when i.share_token_expires_at>statement_timestamp() then coalesce(i.invoice_footer,bp.invoice_footer) else null end
 from public.invoices i join public.business_profiles bp on bp.id=i.business_id
 where p_token_hash ~ '^[0-9a-f]{64}$' and i.share_token_hash=p_token_hash limit 1;
$$;
revoke all on function public.lookup_shared_invoice(text) from public,anon,authenticated;
grant execute on function public.lookup_shared_invoice(text) to anon,authenticated;

-- Authenticated owners can update only invoice-branding/default fields in addition to business_name.
grant update (logo_url, invoice_prefix, default_currency, default_payment_terms_days, invoice_footer) on public.business_profiles to authenticated;

-- Public logos are images only; uploads are restricted to the business profile owner.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('business-logos','business-logos',true,2097152,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=true,file_size_limit=2097152,allowed_mime_types=array['image/png','image/jpeg','image/webp'];
create policy "Business owners can upload invoice logos" on storage.objects for insert to authenticated
with check (bucket_id='business-logos' and exists (select 1 from public.business_profiles bp where bp.id::text=(storage.foldername(name))[1] and bp.owner_user_id=auth.uid()));

-- Optional seller details are saved once and reused on invoices; no customer contact fields are introduced.
alter table public.business_profiles add column if not exists business_phone text, add column if not exists business_address text, add column if not exists website_url text, add column if not exists tax_registration_number text;
alter table public.business_profiles add constraint business_profiles_business_phone_length check (business_phone is null or char_length(business_phone)<=80), add constraint business_profiles_business_address_length check (business_address is null or char_length(business_address)<=500), add constraint business_profiles_website_url_length check (website_url is null or char_length(website_url)<=2048), add constraint business_profiles_tax_registration_length check (tax_registration_number is null or char_length(tax_registration_number)<=100);
grant update (business_phone,business_address,website_url,tax_registration_number) on public.business_profiles to authenticated;
