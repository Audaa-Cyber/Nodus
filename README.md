# Nodus

Nodus is a B2B invoicing and cross-chain payment platform. Merchants can create and issue invoices with instantly rendered "Scan to Pay" QR codes and shareable payment links. Customers pay using canonical USDC across supported testnets via Circle CCTP V2. Verified settlements are reconciled into PostgreSQL and attested asynchronously to the NEAR blockchain (`noduss.testnet`) as an audit trail.

## Supported Networks

| Network | Chain ID | CCTP Domain | USDC Address |
| --- | --- | --- | --- |
| Ethereum Sepolia | 11155111 | 0 | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Base Sepolia | 84532 | 6 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Arbitrum Sepolia | 421614 | 3 | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |
| Optimism Sepolia | 11155420 | 2 | `0x5fd84259d66Cd46123540766Be93DFE6D43130D7` |
| Arc Testnet | 5042002 | 26 | `0x3600000000000000000000000000000000000000` |

## System Architecture

1. **Merchant Portal & Issuance**: Built on Next.js 15 App Router and React 19. When an invoice is issued, it is persisted to PostgreSQL, assigned a sequential invoice number, and pre-generates a payment token hash in under 200ms. The merchant invoice detail renders an SVG QR code immediately without blocking on external networks.
2. **Payment Execution**: Customers connect a wallet or scan the QR code. Cross-chain routes execute via Circle CCTP V2 burn-and-mint mechanisms.
3. **Settlement Verification**: The server verifies the source-chain burn, IRIS attestation, destination `MessageReceived` event, and canonical USDC transfer before updating the invoice to `paid`.
4. **NEAR Audit Registry**: An `AFTER INSERT` trigger on `payment_settlements` populates an outbox table (`near_settlement_outbox`). A background worker synchronizes terms commitments and verified settlement attestations to the `noduss.testnet` contract on NEAR. PostgreSQL remains the authoritative operational source of truth.

## Prerequisites

- Node.js 20+
- npm
- Supabase account and project (PostgreSQL + Auth)
- (Optional) NEAR testnet account and Circle developer API keys for live on-chain operations

## Setup

1. **Install dependencies**:
   ```bash
   npm ci
   ```

2. **Configure environment variables**:
   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Configure the required variables:
   - `NEXT_PUBLIC_APP_URL`: The origin URL (e.g., `http://localhost:3000`).
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public Supabase client configuration.
   - `SUPABASE_SERVICE_ROLE_KEY`: Privileged key used for backend database operations (keep server-side only).
   - `PAYMENT_MODE`: Set to `mock` for local demonstration or `live` for real on-chain payment routes.
   - For live CCTP settlement and NEAR outbox delivery, configure the network RPCs and NEAR signer keys described in `.env.example`.

3. **Database migrations**:
   Apply migrations in `supabase/migrations/` to your Supabase project using the Supabase CLI:
   ```bash
   supabase db push
   ```

4. **Auth configuration**:
   In your Supabase dashboard, set the Auth Site URL to `<NEXT_PUBLIC_APP_URL>` and add `<NEXT_PUBLIC_APP_URL>/auth/callback` to the allowed redirect URLs.

5. **Run the development server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js development server with Turbopack |
| `npm run build` | Create a production build |
| `npm start` | Run the production build |
| `npm run lint` | Run ESLint |
| `npm run test:payments` | Run unit, CCTP, outbox, and regression tests |
| `npm run test:http-route` | Run HTTP route tests |

## Repository Layout

- `src/app/` — Next.js pages, API routes, and server actions
- `src/components/` — UI components (invoice forms, QR share panel, checkout card)
- `src/lib/` — Payment orchestration, CCTP V2 handlers, and Supabase client bindings
- `src/services/` — NEAR client services and Chain Signatures utilities
- `supabase/migrations/` — PostgreSQL migrations, triggers, and outbox functions
- `contracts/payment-registry/` — NEAR Rust contract and deployment records
- `docs/` — Architectural and operational documentation
- `tests/` — Test suites and mock fixtures
- `scripts/` — Post-install compatibility scripts

See [documentation index](docs/README.md) for detailed guides and [security policy](SECURITY.md) for credential handling and vulnerability reporting.
