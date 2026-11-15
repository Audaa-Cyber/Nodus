# Nodus

Nodus is a web app for business invoices and stablecoin checkout. Businesses create invoices and share public links or QR codes. Customers can use supported wallets and payment routes; the server verifies settlement before marking an invoice paid. The landing page's payment preview is simulated.

## Local setup

You need Node.js, npm, and a Supabase project.

1. Install the locked dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_APP_URL` for your local app.
3. Apply the migrations in `supabase/migrations/` to a development Supabase project using your normal migration workflow.
4. Set the Supabase Auth site URL and allow the redirect URL `<NEXT_PUBLIC_APP_URL>/auth/callback`. To use Google sign-in, configure Google as a Supabase Auth provider and add its OAuth credentials there.
5. Start the app with `npm run dev` and open `http://localhost:3000`.

`SUPABASE_SERVICE_ROLE_KEY` is used by privileged server operations and must remain server-side. The example sets `PAYMENT_MODE=mock`; live checkout also needs the server-side network RPC and confirmation settings described in `.env.example`. Circle wallet and NEAR outbox settings are only needed when using those integrations.

## Using Nodus

Create an account, complete the business profile, then create and issue an invoice. Share its public link or QR code with the customer. Available checkout methods depend on the invoice and configured payment routes. Mock mode is for demonstration; live payment handling verifies settlement before changing invoice status.

NEAR invoice registration and eligible settlement attestations use the testnet registry and durable outboxes. PostgreSQL remains the application source of truth. See [NEAR settlement outbox](docs/NEAR-SETTLEMENT-OUTBOX.md) and the [payment registry](contracts/payment-registry/README.md).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Create a production build |
| `npm start` | Serve a production build |
| `npm run lint` | Run ESLint |
| `npm run test:http-route` | Run the HTTP route tests |
| `npm run test:payments` | Run the payment and integration test files |

## Repository layout

- `src/app/` — pages, server actions, and API routes
- `src/components/` — shared interface components
- `src/lib/` — authentication, payment, and service code
- `supabase/migrations/` — database schema, RLS policies, functions, and triggers
- `contracts/payment-registry/` — NEAR payment registry contract and deployment record
- `tests/` — application tests
- `docs/` — operational and project documentation

See [documentation index](docs/README.md) for the project guides and [security policy](SECURITY.md) for credential handling and vulnerability reporting.
