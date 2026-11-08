# Nodus

Nodus is a QR-based business billing and stablecoin checkout concept. Restaurants create an itemized bill, customers scan a QR code and review the amount before authorizing payment, and the platform verifies settlement before marking the bill paid and making a digital receipt available.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Satin Ridges

The landing page uses an original WebGL satin-fabric background in `src/components/satin-ridges.tsx`. It is implemented in this repository and has no third-party component registry, license key, authorization header, or paid dependency.

The component exposes the full configuration surface: colors, backgroundColor, angle, scale, depth, warp, detail, gloss, highlight, sheen, lightAngle, flow, speed, interactive, swell, swellRadius, clickRipples, seed, paused, dpr, className, style, and children.

## Business dashboard setup

The business dashboard uses Supabase Auth and the public anon key with owner-scoped Row Level Security. No service-role key is required by the application.

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_APP_URL` to the project's values and local app URL.
3. Apply the migrations in `supabase/migrations/` using the Supabase CLI or SQL editor.
4. In Supabase Auth, configure the site's URL and add `<NEXT_PUBLIC_APP_URL>/auth/callback` to the allowed redirect URLs. Enable email confirmation if desired.
5. Run `npm run dev`, then create an account at `/register`.

## Customer wallet preview

Public open and overdue invoices can connect EVM wallets and Solana Wallet Standard wallets. EVM support currently covers Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Smart Chain, and Avalanche. The public `/api/wallet/assets` endpoint returns the supported payment tokens across wallet adapters and networks. A listed asset is not a guaranteed route; a future payment phase must request a live quote for the configured invoice destination.

EVM connection uses installed browser wallet providers; on mobile, customers can use a supported wallet's in-app browser. `NEXT_PUBLIC_SOLANA_RPC_URL` optionally selects a managed Solana Mainnet RPC endpoint; otherwise the public Mainnet endpoint is used. Wallet addresses are kept in browser wallet state and are not saved to Supabase. This phase does not request quotes, sign or send transactions, or move funds.

Invoices store amounts as integer minor units (two decimal places) and currency codes separately. A newly issued invoice is Open. Overdue is displayed when an Open invoice's due date has passed. Business owners can issue one-year public invoice links and QR codes; only token hashes are stored. The public page displays invoice details and status, but does not process payments or provide a way to mark an invoice Paid; only verified settlement in a later phase may do that.

## Product scope

The product includes the marketing landing page, business invoice management, public invoice detail pages, and a customer wallet and asset-selection preview. Cross-chain route quote creation, payment execution, and receipts remain out of scope for this phase. The landing-page payment preview remains simulated and does not move funds.
