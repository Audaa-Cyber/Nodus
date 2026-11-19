-- Repair the slug constraint: the previous character class accidentally treated
-- the final hyphen as a range. Hyphens are allowed explicitly at the start.
alter table public.cms_documents drop constraint if exists cms_documents_slug_check;
alter table public.cms_documents add constraint cms_documents_slug_check
  check (slug ~ '^[a-z0-9][-a-z0-9/_]{0,118}$');

-- Seed the current Nodus homepage into the CMS so the first admin can edit it immediately.
insert into public.cms_documents (
  kind, slug, title, status, content, seo, published_at, created_by, updated_by
)
values (
  'homepage',
  'homepage',
  'Homepage',
  'published',
  jsonb_build_object(
    'heroTitle', 'Itemized invoices. Payments made clear.',
    'heroDescription', 'Nodus turns an itemized invoice into a QR checkout. Guests scan, choose a supported stablecoin, and approve payment from their wallet.',
    'ctaLabel', 'Log in',
    'ctaHref', '/login?next=%2Fdashboard',
    'body', 'Create itemized invoices, share a QR checkout, and keep payment status tied to verified settlement.'
  ),
  jsonb_build_object(
    'title', 'Nodus — Business payments, made clear',
    'description', 'Create itemized bills, let guests pay by QR code with supported stablecoins, and give every completed payment a clear digital receipt.'
  ),
  now(),
  'system',
  'system'
)
on conflict (slug) do nothing;
