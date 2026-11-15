-- Migration: Add public.invoices to supabase_realtime publication
-- Enables Supabase Realtime to broadcast invoice UPDATE events to authenticated business owners.
--
-- Note: In accordance with NODUS safety boundaries, this migration is additive
-- and does not modify any existing tables, functions, or prior migrations.

-- 1. Ensure REPLICA IDENTITY FULL is set on public.invoices so that
-- UPDATE and DELETE events include all column values for filtered Realtime evaluation.
alter table public.invoices replica identity full;

-- 2. Add public.invoices to the supabase_realtime publication if not already present
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
