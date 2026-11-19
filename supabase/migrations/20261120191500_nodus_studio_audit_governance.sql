-- Audit and governance hardening for Nodus Studio.
alter table public.cms_admin_users
  add column if not exists updated_by text;

create or replace function public.nodus_control_record_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  where a.workos_user_id = actor
  limit 1;

  insert into public.cms_audit_logs(actor_user_id, actor_email, action, resource_type, resource_id, summary, metadata)
  values (
    actor,
    actor_email_value,
    action_name,
    'cms_admin_user',
    target.id::text,
    action_name || ': ' || target.email,
    jsonb_build_object('role', target.role, 'is_active', target.is_active)
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.nodus_studio_audit_document_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor text;
  actor_email_value text;
  action_name text;
begin
  actor := coalesce(new.updated_by, new.created_by);
  select a.email into actor_email_value
  from public.cms_admin_users a
  where a.workos_user_id = actor
  limit 1;

  if tg_op = 'INSERT' then
    action_name := 'content.created';
  elsif old.status is distinct from new.status and new.status = 'published' then
    action_name := 'content.published';
  elsif old.status is distinct from new.status then
    action_name := 'content.status_changed';
  else
    action_name := 'content.updated';
  end if;

  insert into public.cms_audit_logs(actor_user_id, actor_email, action, resource_type, resource_id, summary, metadata)
  values (
    actor,
    actor_email_value,
    action_name,
    'cms_document',
    new.id::text,
    action_name || ': ' || new.title,
    jsonb_build_object('kind', new.kind, 'slug', new.slug, 'status', new.status)
  );
  return new;
end;
$$;

drop trigger if exists cms_documents_audit_trigger on public.cms_documents;
create trigger cms_documents_audit_trigger
after insert or update on public.cms_documents
for each row execute function public.nodus_studio_audit_document_change();

create or replace function public.nodus_studio_reject_history_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Nodus Studio history is immutable';
end;
$$;

drop trigger if exists cms_audit_logs_immutable_trigger on public.cms_audit_logs;
create trigger cms_audit_logs_immutable_trigger
before update or delete on public.cms_audit_logs
for each row execute function public.nodus_studio_reject_history_mutation();

drop trigger if exists cms_revisions_immutable_trigger on public.cms_revisions;
create trigger cms_revisions_immutable_trigger
before update or delete on public.cms_revisions
for each row execute function public.nodus_studio_reject_history_mutation();

drop trigger if exists cms_content_revisions_immutable_trigger on public.cms_content_revisions;
create trigger cms_content_revisions_immutable_trigger
before update or delete on public.cms_content_revisions
for each row execute function public.nodus_studio_reject_history_mutation();

revoke all on function public.nodus_studio_audit_document_change() from public, anon, authenticated;
revoke all on function public.nodus_studio_reject_history_mutation() from public, anon, authenticated;
