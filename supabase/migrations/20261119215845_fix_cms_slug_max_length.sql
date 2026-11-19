alter table public.cms_documents drop constraint if exists cms_documents_slug_check;
alter table public.cms_documents add constraint cms_documents_slug_check
  check (slug ~ '^[a-z0-9][-a-z0-9/_]{0,119}$');
