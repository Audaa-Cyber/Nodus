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

- WorkOS AuthKit handles sign-up, sign-in, Google OAuth, sessions, and password recovery.
- Supabase stores merchant profiles, invoices, payment attempts, verified settlements, and receipts.
- Supabase RLS authorizes records using the WorkOS JWT subject.
- Circle CCTP V2 provides cross-network USDC routing; merchants connect their own external wallet address. Nodus does not create or custody merchant wallets.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Set `WORKOS_CLIENT_ID` to the Staging client ID. Nodus uses AuthKit's PKCE public-client flow, so `WORKOS_API_KEY` can remain unset.
4. Generate a 32+ character `WORKOS_COOKIE_PASSWORD` (for example, `openssl rand -base64 32`).
5. Set `NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/auth/callback` and `WORKOS_ISSUER` to the comma-separated Staging and Production issuers in `.env.example`.
6. Set the Supabase project URL and publishable key.
7. In Supabase Dashboard → Authentication → Third-Party Auth, add both issuers below and ensure WorkOS JWTs use the `authenticated` role:
   - Staging: `https://api.workos.com/user_management/client_01M7T841PNMYSWF6CYPTWWK7MH`
   - Production: `https://api.workos.com/user_management/client_01M7T841Y5D7AJZHVW8YSTJ9EG`
   If the dashboard permits only one WorkOS provider, add the second issuer as a Custom OIDC provider.
8. Configure the required HTTPS RPC URLs for live payment verification. Circle CCTP itself does not require an API key.
9. Run `npm run dev`.



In each WorkOS environment, keep the Password Reset URL on AuthKit's hosted default. Nodus uses the hosted UI for password reset and does not implement a custom reset form.

### Production environment

In Vercel, use the Production WorkOS client ID `client_01M7T841Y5D7AJZHVW8YSTJ9EG`. `WORKOS_API_KEY` can remain unset because Nodus uses PKCE public-client mode. Also set `WORKOS_COOKIE_PASSWORD`, `NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://nodus.pro.et/auth/callback`, `NEXT_PUBLIC_APP_URL=https://nodus.pro.et`, the Supabase URL and publishable key, and the server-only `SUPABASE_SERVICE_ROLE_KEY`. Do not expose either API key or the service-role key to browser code.

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
