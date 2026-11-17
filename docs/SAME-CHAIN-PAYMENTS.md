# Same-chain USDC payments

## Routing and execution

Checkout previously initialized its source to `base-sepolia` and passed that
default to wallet connection. That could select Base before the wallet's actual
Arc chain was reflected in checkout. Source selection now resolves the connected
chain first, then the configured invoice destination, using the existing network
registry. Explicit payer network selection remains available.

Route discovery compares canonical chain IDs. Equal IDs select `circle_direct`;
different IDs retain the existing `circle_cctp` strategy and supported corridors.
Arc uses the existing chain ID 5042002. No new chain configuration is introduced.

The direct strategy submits one ERC-20 USDC `transfer` through Wagmi, after a
one-shot server reservation, balance/gas checks, and account/chain checks before
submission. It never invokes App Kit or a bridge. Arc's USDC gas balance is
accounted for using the native 18-decimal and token 6-decimal representations.
The review displays amount, networks, recipient, and gas information before the
wallet signature request. Rejected or uncertain submissions cannot report success
or automatically reauthorize the reserved attempt.

The authoritative destination comes from `lookup_shared_payment_context`, which
joins the invoice's business profile. This application currently has no separate
invoice deposit contract/address derivation. Attempt creation binds that recipient,
invoice amount, payer, token, and networks in the immutable server snapshot.
Later business profile changes do not rewrite a committed attempt's recipient.

## Verification and reconciliation

The status handler independently checks the destination RPC chain ID, successful
receipt, transaction chain/from/to, canonical block, configured USDC Transfer log,
authorized payer, recipient, amount, and configured confirmation threshold
(default two). Missing or unfinalized evidence stays pending; invalid evidence
requires review. A browser transaction hash is only a candidate reference.

Only verified destination evidence reaches `record_payment_reconciliation`.
Existing settlement transaction claims prevent another invoice from consuming
the same transaction; existing reconciliation and receipt uniqueness remain in
place. Successful attempts remain terminal when their invoice becomes paid.

The migration extends existing outbox eligibility to direct proofs and adds a
one-shot direct reservation RPC using the existing reservation column. No tables,
uniqueness constraints, or NEAR contract are replaced. The NEAR payload derives
ABI compatibility identifiers from the direct transaction in a separate namespace
and uses policy version 2. The worker still requires matching NEAR readback before
delivery success. NEAR retries do not delay or undo verified destination payment.

## Payment-related files

- Checkout: `src/components/wallet/invoice-wallet-checkout.tsx`, `live-payment-flow.tsx`.
- Routing: `src/lib/wallet/networks.ts`, `src/lib/payments/route-orchestrator.ts`, `src/lib/server/circle.ts`.
- Execution and reference recovery: `src/lib/payments/direct-execution.ts`, `payment-reference-persistence.ts`.
- API: `src/app/api/pay/[token]/attempt/route.ts` and its `[id]/start`, `submit`, and `status` handlers.
- Verification: `src/lib/server/settlement-chain.ts`, `src/lib/payments/settlement-policy.ts`.
- NEAR: `src/lib/payments/near-settlement-payload.ts`, `src/lib/server/near-settlement-outbox.ts`.
- Database: `src/types/database.ts`, `supabase/migrations/20261117120000_same_chain_settlement.sql`.
- Tests: `same-chain-payment`, `circle-status-recovery`, `payment-reference-persistence`, `start-route`, `live-payment-flow-regression`, `near-settlement-payload`, and `near-outbox-delivery` test files.

## Validation (2026-11-17)

`npm run test:payments`: 309 passed, 0 failed, 30 skipped. This covers the required
direct/CCTP route matrix, exact direct execution, signature rejection, changed
network, insufficient balance, invalid settlement, duplicate reconciliation
rejection, and NEAR readback behavior. PostgreSQL integration tests were skipped
because the dedicated local database prerequisites were unavailable; the opt-in
live Circle quote test was also skipped.

`npx tsc --noEmit`, `npm run lint`, and `npm run build` passed. Node test and
Next.js build workers required execution outside the Windows sandbox after
`spawn EPERM` errors. No dependencies were installed for this task.

The migration was applied to the linked Nodus production database on 2026-11-17
after user authorization. The pre-application dry run listed only this migration;
the post-application dry run confirmed the remote database is up to date. Database
integration validation and an authorized wallet end-to-end test remain outstanding.
No wallet transaction was submitted or funds spent; actual Arc-to-Arc testnet
operation is not claimed.
