-- Atomic CMS operations and owner-account invariants for Nodus Studio.

create or replace function public.nodus_cms_bootstrap_owner(
  p_workos_user_id text,
  p_email text,
  p_display_name text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(p_workos_user_id), '') is null
     or nullif(btrim(p_email), '') is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(8119, 23001);

  if exists (select 1 from public.cms_admin_users limit 1) then
    return false;
  end if;

  insert into public.cms_admin_users (
    workos_user_id, email, display_name, role, is_active, invited_by
  ) values (
    btrim(p_workos_user_id), lower(btrim(p_email)),
    nullif(btrim(p_display_name), ''), 'owner', true, btrim(p_workos_user_id)
  );

  return true;
exception
  when unique_violation then return false;
end;
$$;

create or replace function public.nodus_cms_save_document(
  p_document_id uuid,
  p_kind text,
  p_slug text,
  p_title text,
  p_status text,
  p_content jsonb,
  p_seo jsonb,
  p_actor text,
  p_change_note text default null
)
returns table(document_id uuid, version integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_id uuid;
  next_version integer;
  published_time timestamptz;
begin
  if not exists (
    select 1 from public.cms_admin_users a
    where a.workos_user_id = p_actor
      and a.is_active = true
      and a.role in ('owner', 'admin', 'editor')
  ) then
    raise exception 'Studio content permission required' using errcode = '42501';
  end if;

  if p_kind not in ('homepage','feature','faq','announcement','changelog','legal')
     or p_status not in ('draft','published','archived')
     or p_slug !~ '^[a-z0-9][-a-z0-9/_]{0,119}$'
     or char_length(btrim(p_title)) not between 1 and 180
     or jsonb_typeof(p_content) <> 'object'
     or jsonb_typeof(p_seo) <> 'object' then
    raise exception 'Invalid CMS document fields' using errcode = '22023';
  end if;

  published_time := case when p_status = 'published' then statement_timestamp() else null end;

  if p_document_id is null then
    insert into public.cms_documents (
      kind, slug, title, status, content, seo, published_at, created_by, updated_by
    ) values (
      p_kind, p_slug, btrim(p_title), p_status, p_content, p_seo,
      published_time, p_actor, p_actor
    ) returning id into saved_id;
  else
    select d.id into saved_id
    from public.cms_documents d
    where d.id = p_document_id
    for update;

    if saved_id is null then
      raise exception 'CMS document not found' using errcode = 'P0002';
    end if;

    update public.cms_documents
    set kind = p_kind,
        slug = p_slug,
        title = btrim(p_title),
        status = p_status,
        content = p_content,
        seo = p_seo,
        published_at = published_time,
        updated_by = p_actor,
        updated_at = statement_timestamp()
    where id = saved_id;
  end if;

  select coalesce(max(r.version), 0) + 1 into next_version
  from public.cms_revisions r
  where r.document_id = saved_id;

  insert into public.cms_revisions (
    document_id, version, title, status, content, seo, changed_by, change_note
  ) values (
    saved_id, next_version, btrim(p_title), p_status, p_content, p_seo,
    p_actor, left(p_change_note, 240)
  );

  return query select saved_id, next_version;
end;
$$;

create or replace function public.nodus_cms_guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removing_active_owner boolean := false;
begin
  perform pg_advisory_xact_lock(8119, 23002);

  if tg_op = 'DELETE' then
    removing_active_owner := old.role = 'owner' and old.is_active;
  else
    removing_active_owner := old.role = 'owner'
      and old.is_active
      and (new.role <> 'owner' or not new.is_active);
  end if;

  if removing_active_owner and not exists (
    select 1 from public.cms_admin_users a
    where a.id <> old.id and a.role = 'owner' and a.is_active = true
  ) then
    raise exception 'Nodus must always have at least one active owner'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists cms_admin_last_owner_guard on public.cms_admin_users;
create trigger cms_admin_last_owner_guard
before update or delete on public.cms_admin_users
for each row execute function public.nodus_cms_guard_last_owner();

revoke all on function public.nodus_cms_bootstrap_owner(text,text,text) from public, anon, authenticated;
revoke all on function public.nodus_cms_save_document(uuid,text,text,text,text,jsonb,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.nodus_cms_guard_last_owner() from public, anon, authenticated;
grant execute on function public.nodus_cms_bootstrap_owner(text,text,text) to service_role;
grant execute on function public.nodus_cms_save_document(uuid,text,text,text,text,jsonb,jsonb,text,text) to service_role;
