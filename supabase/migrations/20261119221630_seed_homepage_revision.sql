-- Record the seeded homepage as the first immutable Studio revision.
with homepage as (
  select id, title, status, content, seo
  from public.cms_documents
  where slug = 'homepage' and kind = 'homepage'
  limit 1
)
insert into public.cms_revisions (document_id, version, title, status, content, seo, changed_by, change_note)
select id, 1, title, status, content, seo, 'system', 'Initial CMS seed from the public homepage'
from homepage h
where not exists (
  select 1 from public.cms_revisions r where r.document_id = h.id
);

insert into public.cms_audit_logs (
  actor_user_id, action, resource_type, resource_id, summary, metadata
)
select
  'system', 'content.seeded', 'cms_document', d.id::text,
  'Seeded initial public homepage content',
  jsonb_build_object('kind', d.kind, 'slug', d.slug, 'status', d.status)
from public.cms_documents d
where d.slug = 'homepage' and d.kind = 'homepage'
  and not exists (
    select 1 from public.cms_audit_logs a
    where a.action = 'content.seeded' and a.resource_id = d.id::text
  );