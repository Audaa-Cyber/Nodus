# Login and payment issues

This file records the reported issues, findings, and implementation status.

## Problem 1: Login session is lost after restarting `npm run dev`

- **Observed:** Nodus asks the user to sign in again after the development server is restarted.
- **Code inspected:** Supabase SSR browser client, server actions, callback route, and middleware.
- **Finding:** The app uses Supabase cookie-based sessions, which should outlive a Next.js dev server restart. No repository code found that intentionally clears the auth cookie on server restart.
- **Likely cause to verify:** The browser is opening a different origin or browser profile after restart (for example, `localhost` vs `127.0.0.1`). If the origin is unchanged, inspect whether the `sb-…-auth-token` cookie is set after sign-in and remains after restart; the observed behavior alone does not identify a code-level root cause.
- **Status:** User approved work on Problem 1. The available browser inspection service is unavailable in this session, and static code confirms persistent cookie behavior is already configured by `@supabase/ssr`; no code change has been made without evidence of the failing cookie path. Runtime cookie/origin verification is still needed.

## Problem 2: Payment route discovery returns `unsupported_circle_testnet_payment_route`

- **Observed:** Checkout shows the error under “Confirm payment parameters” and offers “Retry discovery.”
- **Code inspected:** `src/app/api/pay/[token]/routes/route.ts`, wallet asset list, checkout source-network selection, merchant profile form, and Circle network mapping.
- **Root cause in code:** This exact error is emitted locally by the routes API before any Circle quote/request. Its guard rejects a source asset or invoice destination unless it is an exact supported testnet USDC combination. The most likely mismatch is a stored merchant `receiving_network` such as legacy `base`: profile updates still accept `base`/`ethereum`, and the form defaults an unset value to `base`, while checkout only accepts the exact testnet keys `sepolia`, `base-sepolia`, `arbitrum-sepolia`, and `optimism-sepolia`. Circle's helper accepts aliases such as `base`, but the route API's preceding exact-key lookup rejects them. The error is generic, so the live invoice's stored value is not proven from the message alone; source asset fields are also checked by the same guard.
- **Fix applied:** New profiles now start with no assumed destination. Profile saving allows supported live testnets and keeps an existing legacy destination editable without silently converting it; the profile UI marks unsupported saved networks and explains that checkout requires one of the supported testnets. Route discovery now distinguishes unsupported merchant destination from unsupported payer asset, and checkout displays readable guidance for each.
- **Remaining user action:** The affected business profile's live receiving network was not inspected or changed. If it is a mainnet value such as `base`, the owner must explicitly choose a supported testnet destination to use current testnet checkout. Do not silently convert it to `base-sepolia`, since that changes the intended settlement network.
- **Status:** Approved code fix applied; live profile configuration remains unchanged and may still need the merchant's explicit network selection.

## Problem 3: Circle embedded wallet rejects a direct USDC transfer with `Invalid amount in contract execution request`

- **Observed:** Embedded Circle wallet fails on Base Sepolia for a USDC transfer; extension wallet works. The calldata encodes `transfer(...)` of 10 USDC (`0x989680` base units) and the native transaction value is zero (`0 ETH`).
- **Root cause:** The embedded EIP-1193 provider forwards the RPC transaction's `value` as-is to `/api/wallet/circle/guest/transaction`. EVM RPC encodes native value as hex wei (`0x0`). The route treats any calldata as a contract execution and forwards that raw value as Circle's optional `amount`; the server helper includes it because the string is truthy. Circle rejects this amount representation. This is separate from the ERC-20 transfer amount in calldata, which is correctly encoded.
- **Fix applied:** The guest transaction API now validates and parses the EVM RPC `value`, converts nonzero wei to a decimal native amount, and leaves the Circle contract-execution amount unset when the value is zero. It continues to pass the original calldata unchanged. Native transfer challenges also use the normalized value when no explicit token amount is provided.
- **Status:** Approved code fix applied. No live transaction was sent during the change.

## Problem 4: Circle embedded payment returns `attempt_unavailable` after PIN approval

- **Observed:** Checkout accepts the Circle PIN and transaction signing, then shows `Try again` with `attempt_unavailable`.
- **Root cause:** Same-chain `circle_direct` attempts remain `PENDING_DEPOSIT` and do not reserve CCTP execution. The submit API nevertheless sent every transaction hash to `submit_circle_broadcast_references`, which only accepts CCTP attempts with an execution reservation in `PROCESSING` or `KNOWN_DEPOSIT_TX`. The direct transfer hash was therefore rejected after the wallet could already have broadcast it.
- **Fix applied:** The submit API dispatches using the server-stored quote type. A new service-only database function validates the immutable direct quote and records the hash idempotently without weakening the CCTP reservation guard. The checkout now retains and retries saving the public transaction hash, and avoids showing a second-payment retry after a hash is known.
- **Status:** Code is ready, and the production migration push completed successfully on 2026-11-13 for `20261113110000_cctp_v2_nonce_outbox_eligibility.sql` and `20261113120000_circle_direct_broadcast_persistence.sql`. A follow-up migration-list query failed with a Supabase transport error, so the applied state could not be independently re-read afterward. No live transaction was sent during the deployment.
