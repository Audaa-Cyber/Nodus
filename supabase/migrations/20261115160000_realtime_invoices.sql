-- Migration: Add public.invoices to supabase_realtime publication
-- Enables Supabase Realtime to broadcast invoice UPDATE events to authenticated business owners.
--
-- Note: In accordance with NODUS safety boundaries, this migration is additive
-- and does not modify any existing tables, functions, or prior migrations.

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
        and tablename = 'invoices'
    ) then
      alter publication supabase_realtime add table public.invoices;
    end if;
  end if;
end $$;
