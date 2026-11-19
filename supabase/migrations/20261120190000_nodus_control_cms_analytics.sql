-- Nodus Control: private CMS, RBAC, immutable revisions/audit, privacy-first analytics.
create table if not exists public.cms_admin_users (
  id uuid primary key default gen_random_uuid(),
  workos_user_id text not null unique,
  email text not null,
  display_name text,
  role text not null default 'editor' check (role in ('owner','admin','editor','analyst')),
  is_active boolean not null default true,
  invited_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists public.cms_content (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('homepage','feature','faq','announcement','changelog','privacy','terms','page')),
  slug text not null unique,
  title text not null,
  excerpt text,
  body jsonb not null default '{}'::jsonb check (jsonb_typeof(body) = 'object'),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  seo_title text,
  seo_description text,
  social_image_url text,
  sort_order integer not null default 0,
  published_at timestamptz,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cms_content_type_status_idx on public.cms_content(content_type, status, sort_order);
create index if not exists cms_content_updated_at_idx on public.cms_content(updated_at desc);

create table if not exists public.cms_content_revisions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.cms_content(id) on delete restrict,
  content_snapshot jsonb not null,
  changed_by text,
  change_note text,
  created_at timestamptz not null default now()
);
create index if not exists cms_content_revisions_content_created_idx on public.cms_content_revisions(content_id, created_at desc);

create table if not exists public.cms_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.cms_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text,
  actor_email text,
  action text not null,
  resource_type text not null,
  resource_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cms_audit_logs_created_idx on public.cms_audit_logs(created_at desc);

-- Only coarse page-view analytics are collected. No IP address, full user-agent, or personal data.
create table if not exists public.cms_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  event_name text not null check (event_name in ('page_view')),
  path text not null check (char_length(path) between 1 and 500),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 255),
  session_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists cms_analytics_events_created_idx on public.cms_analytics_events(created_at desc);
create index if not exists cms_analytics_events_path_created_idx on public.cms_analytics_events(path, created_at desc);
create index if not exists cms_analytics_events_session_created_idx on public.cms_analytics_events(session_id, created_at desc);

create or replace function public.nodus_control_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.cms_admin_users a
    where a.workos_user_id = (auth.jwt() ->> 'sub')
      and a.is_active = true
  );
$$;

create or replace function public.nodus_control_can_edit()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.cms_admin_users a
    where a.workos_user_id = (auth.jwt() ->> 'sub')
      and a.is_active = true
      and a.role in ('owner','admin','editor')
  );
$$;

create or replace function public.nodus_control_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.cms_admin_users a
    where a.workos_user_id = (auth.jwt() ->> 'sub')
      and a.is_active = true
      and a.role = 'owner'
  );
$$;

revoke all on function public.nodus_control_is_admin() from public, anon;
revoke all on function public.nodus_control_can_edit() from public, anon;
revoke all on function public.nodus_control_is_owner() from public, anon;
grant execute on function public.nodus_control_is_admin() to authenticated;
grant execute on function public.nodus_control_can_edit() to authenticated;
grant execute on function public.nodus_control_is_owner() to authenticated;

create or replace function public.nodus_control_record_content_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  snapshot jsonb;
  actor text;
  action_name text;
  resource_id text;
  summary_text text;
begin
  actor := auth.jwt() ->> 'sub';
  if tg_op = 'DELETE' then
    snapshot := to_jsonb(old);
    resource_id := old.id::text;
    action_name := 'content.deleted';
    summary_text := 'Deleted content: ' || old.title;
    insert into public.cms_content_revisions(content_id, content_snapshot, changed_by, change_note)
    values (old.id, snapshot, actor, 'Snapshot before deletion');
    return old;
  elsif tg_op = 'UPDATE' then
    snapshot := to_jsonb(old);
    resource_id := new.id::text;
    action_name := case when old.status <> new.status then 'content.status_changed' else 'content.updated' end;
    summary_text := 'Updated content: ' || new.title;
  else
    snapshot := null;
    resource_id := new.id::text;
    action_name := 'content.created';
    summary_text := 'Created content: ' || new.title;
  end if;

  if snapshot is not null then
    insert into public.cms_content_revisions(content_id, content_snapshot, changed_by)
    values (new.id, snapshot, actor);
  end if;

  insert into public.cms_audit_logs(actor_user_id, action, resource_type, resource_id, summary, metadata)
  values (actor, action_name, 'cms_content', resource_id, summary_text,
    jsonb_build_object('slug', coalesce(new.slug, old.slug), 'content_type', coalesce(new.content_type, old.content_type)));
  return new;
end;
$$;

drop trigger if exists cms_content_audit_trigger on public.cms_content;
create trigger cms_content_audit_trigger
after insert or update on public.cms_content
for each row execute function public.nodus_control_record_content_change();

create or replace function public.nodus_control_record_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor text;
  target public.cms_admin_users;
  action_name text;
begin
  actor := auth.jwt() ->> 'sub';
  if tg_op = 'DELETE' then
    target := old;
    action_name := 'admin.removed';
  elsif tg_op = 'UPDATE' then
    target := new;
    action_name := 'admin.updated';
  else
    target := new;
    action_name := 'admin.added';
  end if;
  insert into public.cms_audit_logs(actor_user_id, actor_email, action, resource_type, resource_id, summary, metadata)
  values (actor, target.email, action_name, 'cms_admin_user', target.id::text,
    action_name || ': ' || target.email,
    jsonb_build_object('role', target.role, 'is_active', target.is_active));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists cms_admin_audit_trigger on public.cms_admin_users;
create trigger cms_admin_audit_trigger
after insert or update or delete on public.cms_admin_users
for each row execute function public.nodus_control_record_admin_change();

alter table public.cms_admin_users enable row level security;
alter table public.cms_content enable row level security;
alter table public.cms_content_revisions enable row level security;
alter table public.cms_settings enable row level security;
alter table public.cms_audit_logs enable row level security;
alter table public.cms_analytics_events enable row level security;

drop policy if exists cms_admin_select_self on public.cms_admin_users;
create policy cms_admin_select_self on public.cms_admin_users
for select to authenticated
using (workos_user_id = (auth.jwt() ->> 'sub') or public.nodus_control_is_owner());

drop policy if exists cms_admin_owner_manage on public.cms_admin_users;
create policy cms_admin_owner_manage on public.cms_admin_users
for all to authenticated
using (public.nodus_control_is_owner())
with check (public.nodus_control_is_owner());

drop policy if exists cms_content_public_read on public.cms_content;
create policy cms_content_public_read on public.cms_content
for select to anon, authenticated
using (status = 'published' or public.nodus_control_is_admin());

drop policy if exists cms_content_editor_insert on public.cms_content;
create policy cms_content_editor_insert on public.cms_content
for insert to authenticated
with check (public.nodus_control_can_edit());

drop policy if exists cms_content_editor_update on public.cms_content;
create policy cms_content_editor_update on public.cms_content
for update to authenticated
using (public.nodus_control_can_edit())
with check (public.nodus_control_can_edit());

drop policy if exists cms_content_admin_delete on public.cms_content;
create policy cms_content_admin_delete on public.cms_content
for delete to authenticated
using (public.nodus_control_is_owner());

drop policy if exists cms_revisions_admin_read on public.cms_content_revisions;
create policy cms_revisions_admin_read on public.cms_content_revisions
for select to authenticated using (public.nodus_control_is_admin());

drop policy if exists cms_settings_admin_all on public.cms_settings;
create policy cms_settings_admin_all on public.cms_settings
for all to authenticated
using (public.nodus_control_is_admin())
with check (public.nodus_control_is_admin());

drop policy if exists cms_audit_admin_read on public.cms_audit_logs;
create policy cms_audit_admin_read on public.cms_audit_logs
for select to authenticated using (public.nodus_control_is_admin());

drop policy if exists cms_analytics_public_insert on public.cms_analytics_events;
create policy cms_analytics_public_insert on public.cms_analytics_events
for insert to anon, authenticated
with check (
  event_name = 'page_view'
  and path !~ '^/(control|dashboard|api)(/|$)'
  and path !~ '([?]token=|[?]email=)'
);

drop policy if exists cms_analytics_admin_read on public.cms_analytics_events;
create policy cms_analytics_admin_read on public.cms_analytics_events
for select to authenticated using (public.nodus_control_is_admin());

grant select on public.cms_content to anon, authenticated;
grant insert, update, delete on public.cms_content to authenticated;
grant select on public.cms_admin_users, public.cms_content_revisions, public.cms_settings, public.cms_audit_logs, public.cms_analytics_events to authenticated;
grant insert on public.cms_analytics_events to anon, authenticated;
