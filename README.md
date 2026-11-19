# Nodus

Nodus is a B2B invoicing and USDC payment platform. Merchants create invoices with shareable payment links. Customers connect their own wallet, choose one of the networks enabled on the invoice, and pay the merchant's wallet address.

## Supported invoice networks

- Ethereum Sepolia
- Base Sepolia
- Arbitrum Sepolia
- Optimism Sepolia

A merchant can configure one wallet address and enable any combination of the four networks. Each invoice can offer any subset of the merchant's enabled networks. The customer selects the destination network at checkout.

## Authentication and data

- WorkOS AuthKit handles sign-up, sign-in, Google OAuth, sessions, and password recovery.
- Supabase stores merchant profiles, invoices, payment attempts, verified settlements, and receipts.
- Supabase RLS authorizes records using the WorkOS JWT subject.
- Circle CCTP V2 provides cross-network USDC routing; merchants connect their own external wallet address. Nodus does not create or custody merchant wallets.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Set `WORKOS_CLIENT_ID` to the WorkOS staging client ID.
4. Generate a 32+ character `WORKOS_COOKIE_PASSWORD`.
5. Set `NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/auth/callback`.
6. Set the Supabase project URL and publishable key.
7. Add the WorkOS staging issuer as a third-party auth provider in Supabase and set its JWT role claim to `authenticated`.
8. Configure the Circle API key and required RPC URLs for live payment routes.
9. Run `npm run dev`.

## Security notes

- Keep service-role keys and Circle API keys server-only.
- Never mark an invoice paid from a browser callback. Nodus records paid status only after independent destination settlement verification.
- An issued invoice's payment address and accepted networks are immutable.
- Testnet payments are not real funds.

## Main folders

- `src/app/` — Next.js routes, pages, and API endpoints
- `src/components/` — merchant and payer interfaces
- `src/lib/` — authentication, invoice, payment, and database logic
- `supabase/migrations/` — ordered database schema and security changes
- `tests/` — payment and invoice regression tests
