-- Switch Nodus identity records from WorkOS subjects to Supabase Auth UUIDs.
-- Existing customer and CMS admin tables were empty when this migration ran.
alter table public.cms_admin_users rename column workos_user_id to supabase_user_id;
alter table public.cms_admin_users rename constraint cms_admin_users_workos_user_id_key to cms_admin_users_supabase_user_id_key;

drop policy if exists cms_admin_select_self on public.cms_admin_users;
create policy cms_admin_select_self on public.cms_admin_users
  for select to authenticated
  using (supabase_user_id = (auth.jwt() ->> 'sub') or public.nodus_control_is_owner());

create or replace function public.nodus_control_can_edit()
returns boolean language sql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.cms_admin_users a
    where a.supabase_user_id = (auth.jwt() ->> 'sub')
      and a.is_active = true
      and a.role in ('owner','admin','editor')
  );
$function$;

create or replace function public.nodus_control_is_admin()
returns boolean language sql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.cms_admin_users a
    where a.supabase_user_id = (auth.jwt() ->> 'sub')
      and a.is_active = true
  );
$function$;

create or replace function public.nodus_control_is_owner()
returns boolean language sql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.cms_admin_users a
    where a.supabase_user_id = (auth.jwt() ->> 'sub')
      and a.is_active = true
      and a.role = 'owner'
  );
$function$;

create or replace function public.nodus_control_record_admin_change()
returns trigger language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  actor text;
  actor_email_value text;
  target public.cms_admin_users;
  action_name text;
begin
  if tg_op = 'DELETE' then
    target := old;
    actor := coalesce(old.updated_by, old.invited_by, auth.jwt() ->> 'sub');
    action_name := 'admin.removed';
  elsif tg_op = 'UPDATE' then
    target := new;
    actor := coalesce(new.updated_by, old.updated_by, old.invited_by, auth.jwt() ->> 'sub');
    action_name := 'admin.updated';
  else
    target := new;
    actor := coalesce(new.invited_by, auth.jwt() ->> 'sub');
    action_name := 'admin.added';
  end if;

  select a.email into actor_email_value
  from public.cms_admin_users a
  where a.supabase_user_id = actor
  limit 1;

  insert into public.cms_audit_logs(actor_user_id, actor_email, action, resource_type, resource_id, summary, metadata)
  values (
    actor, actor_email_value, action_name, 'cms_admin_user', target.id::text,
    action_name || ': ' || target.email,
    jsonb_build_object('role', target.role, 'is_active', target.is_active)
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop function if exists public.nodus_cms_bootstrap_owner(text,text,text);
create function public.nodus_cms_bootstrap_owner(
  p_supabase_user_id text,
  p_email text,
  p_display_name text default null
) returns boolean
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if nullif(btrim(p_supabase_user_id), '') is null
     or nullif(btrim(p_email), '') is null then
    return false;
  end if;
  perform pg_advisory_xact_lock(8119, 23001);
  if exists (select 1 from public.cms_admin_users limit 1) then
    return false;
  end if;
  insert into public.cms_admin_users (supabase_user_id, email, display_name, role, is_active, invited_by)
  values (btrim(p_supabase_user_id), lower(btrim(p_email)), nullif(btrim(p_display_name), ''), 'owner', true, btrim(p_supabase_user_id));
  return true;
exception when unique_violation then return false;
end;
$function$;

revoke all on function public.nodus_cms_bootstrap_owner(text,text,text) from public, anon, authenticated;
grant execute on function public.nodus_cms_bootstrap_owner(text,text,text) to service_role;

-- Remove the legacy WorkOS issuer gate. Per-user RLS policies continue to
-- authorize records by matching the Supabase Auth JWT subject.
do $$
declare p record;
begin
  for p in
    select schemaname, tablename
    from pg_policies
    where schemaname = 'public' and policyname = 'workos_issuer_guard'
  loop
    execute format('drop policy if exists %I on %I.%I', 'workos_issuer_guard', p.schemaname, p.tablename);
  end loop;
end $$;
