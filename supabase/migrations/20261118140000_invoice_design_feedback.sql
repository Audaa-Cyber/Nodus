-- Additive support for the approved invoice dossiers and receipt feedback.
-- Does not change invoice/payment mutation functions or settlement classification.
begin;

create table public.invoice_feedback (
  invoice_id uuid primary key references public.invoices(id) on delete cascade,
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 2000),
  submitted_at timestamptz not null default statement_timestamp()
);
alter table public.invoice_feedback enable row level security;
revoke all on public.invoice_feedback from public, anon, authenticated;
grant select on public.invoice_feedback to authenticated;
create policy "Business owner reads invoice feedback" on public.invoice_feedback
for select to authenticated using (exists (
  select 1 from public.business_profiles bp
  where bp.id = invoice_feedback.business_id and bp.owner_user_id = auth.uid()
));

-- Customer dossiers are visible only through the same unexpired capability as
-- the shared invoice. The existing model records name and email only.
create function public.lookup_shared_invoice_parties(p_token_hash text)
returns table(invoice_id uuid, customer_name text, customer_email text,
  customer_company text, customer_phone text, customer_address text)
language sql stable security definer set search_path = '' as $$
  select i.id, i.customer_name, i.customer_email, null::text, null::text, null::text
  from public.invoices i
  where p_token_hash ~ '^[0-9a-f]{64}$' and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp()
  limit 1;
$$;

create function public.lookup_shared_invoice_feedback(p_token_hash text)
returns table(rating smallint, comment text, customer_name text, submitted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select f.rating, f.comment, i.customer_name, f.submitted_at
  from public.invoices i join public.invoice_feedback f on f.invoice_id = i.id
  where p_token_hash ~ '^[0-9a-f]{64}$' and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp() and i.status = 'paid'
  limit 1;
$$;

-- Export the immutable settlement recipient. Current business wallet settings
-- can change after payment and must never be printed as historical evidence.
create function public.lookup_shared_receipt_destinations(p_token_hash text)
returns table(receipt_number text, recipient_address text)
language sql stable security definer set search_path = '' as $$
  select r.receipt_number, s.recipient_address
  from public.invoices i
  join public.payment_receipts r on r.invoice_id = i.id and r.business_id = i.business_id
  join public.payment_settlements s on s.id = r.payment_settlement_id
    and s.invoice_id = i.id and s.business_id = i.business_id
  where p_token_hash ~ '^[0-9a-f]{64}$' and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp() and i.status = 'paid'
  order by r.issued_at desc limit 100;
$$;

create function public.submit_shared_invoice_feedback(p_token_hash text, p_rating integer, p_comment text default null)
returns table(rating smallint, comment text, customer_name text, submitted_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare target public.invoices%rowtype;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5
    or (p_comment is not null and char_length(p_comment) > 2000) then
    raise exception 'invalid_feedback' using errcode = '22023';
  end if;
  -- Lock the invoice to serialize feedback with cancellation/revocation.
  select i.* into target from public.invoices i
  where p_token_hash ~ '^[0-9a-f]{64}$' and i.share_token_hash = p_token_hash
    and i.share_token_expires_at > statement_timestamp() and i.status = 'paid'
  for update;
  if not found then raise exception 'invoice_unavailable' using errcode = 'P0002'; end if;
  insert into public.invoice_feedback as f (invoice_id,business_id,rating,comment)
  values (target.id,target.business_id,p_rating,nullif(btrim(p_comment),''))
  on conflict (invoice_id) do update set rating = excluded.rating, comment = coalesce(excluded.comment, f.comment),
    submitted_at = statement_timestamp();
  return query select f.rating, f.comment, target.customer_name, f.submitted_at
    from public.invoice_feedback f where f.invoice_id = target.id;
end;
$$;

revoke all on function public.lookup_shared_invoice_parties(text) from public,anon,authenticated;
revoke all on function public.lookup_shared_invoice_feedback(text) from public,anon,authenticated;
revoke all on function public.lookup_shared_receipt_destinations(text) from public,anon,authenticated;
revoke all on function public.submit_shared_invoice_feedback(text,integer,text) from public,anon,authenticated;
grant execute on function public.lookup_shared_invoice_parties(text) to anon,authenticated;
grant execute on function public.lookup_shared_invoice_feedback(text) to anon,authenticated;
grant execute on function public.lookup_shared_receipt_destinations(text) to anon,authenticated;
grant execute on function public.submit_shared_invoice_feedback(text,integer,text) to anon,authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'invoice_feedback') then
    alter publication supabase_realtime add table public.invoice_feedback;
  end if;
end $$;
commit;
