# Nodus

Nodus is a B2B invoicing and USDC payment platform. Merchants create invoices with shareable payment links. Customers connect their own wallet, choose one of the networks enabled on the invoice, and pay the merchant's wallet address.

## Supported invoice networks

- Ethereum Sepolia
- Base Sepolia
- Arbitrum Sepolia
- Optimism Sepolia
- Arc Testnet

A merchant can configure one wallet address and enable any combination of the five networks. Each invoice can offer any subset of the merchant's enabled networks. The customer selects the destination network at checkout.

## Authentication and data

- Supabase Auth handles email/password sign-up, six-digit email verification, Google OAuth, sessions, and password recovery.
- Supabase stores merchant profiles, invoices, payment attempts, verified settlements, receipts, and private CMS roles.
- Cookie-backed Supabase SSR sessions are verified on the server. Row Level Security authorizes merchant records using the Supabase Auth user UUID.
- Circle CCTP V2 provides cross-network USDC routing; merchants connect their own external wallet address. Nodus does not create or custody merchant wallets.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase project.
4. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. It is used by private Studio/CMS routes and must never be exposed to browser code.
5. Set `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
6. In Supabase Dashboard → Authentication → URL Configuration, set the local Site URL to `http://localhost:3000` and allow `http://localhost:3000/auth/callback`.
7. In Authentication → Sign In / Providers, enable Google and configure the Google OAuth Client ID and Client Secret. In Google Cloud Console, add this Supabase callback URI to the OAuth client's Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`.
8. In Authentication → Email Templates → Confirm signup, use `{{ .Token }}` in the message body to send a six-digit code. Ensure email confirmations are enabled in the Email provider settings.
9. Configure the required HTTPS RPC URLs for live payment verification. Circle CCTP itself does not require an API key.
10. Run `npm run dev`.

For password recovery, the app sends a Supabase reset email and returns through `/auth/callback` to the custom password update page.

### Production environment

Set the production Supabase project URL, publishable key, `NEXT_PUBLIC_APP_URL`, and server-only `SUPABASE_SERVICE_ROLE_KEY` in the deployment environment. Add the production callback URL to Supabase Authentication → URL Configuration. Use the production Google OAuth client and add the production Supabase callback URI in Google Cloud Console. Never expose the service-role key in browser code.

## Security notes

- Keep service-role keys server-only.
- Never mark an invoice paid from a browser callback. Nodus records paid status only after independent destination settlement verification.
- An issued invoice's payment address and accepted networks are immutable.
- Testnet payments are not real funds.

## Main folders

- `src/app/` — Next.js routes, pages, and API endpoints
- `src/components/` — merchant and payer interfaces
- `src/lib/` — authentication, invoice, payment, and database logic
- `supabase/migrations/` — ordered database schema and security changes
- `tests/` — payment and invoice regression tests

## Nodus Studio

Nodus Studio is the private CMS and public-site analytics workspace at `/studio`. It is not linked from the public website, is excluded from search indexing, and returns the branded 404 for visitors without an active Studio role. Every Studio API route verifies the Supabase Auth identity and checks its database role independently.

### First owner setup

1. Add `SUPABASE_SERVICE_ROLE_KEY` to the server environment (local `.env.local` and Vercel Production/Preview as appropriate). This key is required by server-only CMS routes and must never use a `NEXT_PUBLIC_` prefix.
2. Set `CMS_ADMIN_EMAILS` to the first owner's verified Supabase Auth email. Alternatively, set `CMS_ADMIN_SUPABASE_USER_IDS` to a comma-separated list of verified Supabase Auth user UUIDs.
3. Sign in with that verified Supabase account and visit `/studio`. If `cms_admin_users` is empty, the first matching identity is inserted as the owner.
4. Remove the bootstrap environment value after the owner record exists. The role is then managed in Supabase, not through the environment allowlist.

### Studio roles

- **Owner:** full access, including team and role management.
- **Admin:** manage content, analytics, audit activity, and safe public-site settings.
- **Editor:** create, edit, archive, and publish website content.
- **Analyst:** read-only content, analytics, and audit activity.

Only existing, email-verified Supabase Auth accounts can be added to the team. Add the user's Supabase Auth UUID and verified account email from the Access & Roles section. Disable access there when needed.

### CMS and analytics

Studio manages the public homepage, features, FAQs, announcements, changelog, privacy policy, terms, SEO metadata, and social preview images. Content is saved as drafts, can be previewed, and is versioned on every edit. Publishing updates the public CMS endpoints and connected pages.

Website analytics track public page views and marked CTA clicks using a first-party anonymous visitor token. The system stores a token hash, path, coarse referrer hostname, event type, and timestamp. It does not collect IP addresses, customer checkout URLs, invoice data, wallet addresses, or payment records. Trend comparisons use the immediately preceding period of the same length.

The audit trail is append-only at the database level. Studio settings are limited to public-site announcement banners, FAQ/changelog visibility flags, and default SEO metadata. Payment secrets, billing settings, invoices, and settlement records remain outside this CMS.
