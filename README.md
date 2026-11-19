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
3. Set `WORKOS_CLIENT_ID` and `WORKOS_API_KEY` to the Staging environment credentials.
4. Generate a 32+ character `WORKOS_COOKIE_PASSWORD`.
5. Set `NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/auth/callback`.
6. Set `WORKOS_ISSUER` to the trusted Staging and Production issuer URLs shown in `.env.example`.
7. Set the Supabase project URL and publishable key.
8. In Supabase Dashboard → Authentication → Third-Party Auth, trust both WorkOS issuers and map the JWT role to `authenticated`. If the WorkOS integration accepts only one issuer, add the other as a Custom OIDC provider.
9. Configure the required HTTPS RPC URLs for live payment verification. Circle CCTP itself does not require an API key.
10. Run `npm run dev`.

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
