-- Nodus public-site CMS and privacy-conscious analytics.
-- CMS tables are intentionally inaccessible to anon/authenticated roles.
-- All reads/writes go through server routes after a WorkOS admin allowlist check.

create table if not exists public.cms_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('homepage','feature','faq','announcement','changelog','legal')),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-/_-]{0,119}$'),
  title text not null check (char_length(btrim(title)) between 1 and 180),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  seo jsonb not null default '{}'::jsonb check (jsonb_typeof(seo) = 'object'),
  published_at timestamptz,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cms_documents_status_kind_idx
  on public.cms_documents (status, kind, updated_at desc);

create table if not exists public.cms_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.cms_documents(id) on delete cascade,
  version integer not null check (version > 0),
  title text not null,
  status text not null check (status in ('draft','published','archived')),
  content jsonb not null,
  seo jsonb not null,
  changed_by text not null,
  change_note text,
  created_at timestamptz not null default now(),
  unique(document_id, version)
);

create index if not exists cms_revisions_document_created_idx
  on public.cms_revisions (document_id, created_at desc);

-- Event-level analytics contain only a random, first-party visitor token hash,
-- page path, coarse referrer host, and event name. No IP, email, wallet, or invoice data.
create table if not exists public.cms_analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null check (event_name in ('page_view','cta_click')),
  path text not null check (path like '/%' and char_length(path) <= 500),
  visitor_hash text not null check (visitor_hash ~ '^[a-f0-9]{64}$'),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 255),
  cta_id text check (cta_id is null or char_length(cta_id) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists cms_analytics_created_idx
  on public.cms_analytics_events (created_at desc);
create index if not exists cms_analytics_path_created_idx
  on public.cms_analytics_events (path, created_at desc);
create index if not exists cms_analytics_visitor_created_idx
  on public.cms_analytics_events (visitor_hash, created_at desc);

alter table public.cms_documents enable row level security;
alter table public.cms_revisions enable row level security;
alter table public.cms_analytics_events enable row level security;

revoke all on public.cms_documents from anon, authenticated;
revoke all on public.cms_revisions from anon, authenticated;
revoke all on public.cms_analytics_events from anon, authenticated;
grant all on public.cms_documents to service_role;
grant all on public.cms_revisions to service_role;
grant all on public.cms_analytics_events to service_role;
grant usage, select on sequence public.cms_analytics_events_id_seq to service_role;

comment on table public.cms_documents is 'Nodus public marketing website content. Server-only access.';
comment on table public.cms_revisions is 'Immutable snapshots of CMS document edits and publish history.';
comment on table public.cms_analytics_events is 'Privacy-conscious public website analytics; excludes IP addresses and customer/payment data.';
