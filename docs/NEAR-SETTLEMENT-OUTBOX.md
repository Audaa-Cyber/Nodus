# NEAR verified settlement outbox

## Trust boundary and flow

The authoritative event is the server-side `record_payment_reconciliation` RPC call in the CCTP attempt status handler. Before that call, the server independently correlates Circle's CCTP V2 message with source-chain events, verifies the destination MessageReceived event and merchant USDC transfer, and checks destination finality. The browser submits only an attempt identifier; the browser cannot insert into `payment_settlements` or `near_settlement_outbox`.

An `AFTER INSERT` trigger on `payment_settlements` creates one private outbox row for eligible Circle CCTP USDC settlements between Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, and Optimism Sepolia. It records the settlement/reconciliation UUID, invoice UUID, attempt UUID, source transaction hash and destination transaction hashes. Rows without the verifier metadata required by the deployed contract ABI are created blocked for review. The database unique constraints make reconciliation replay idempotent. PostgreSQL settlement records remain the source of truth.

The worker synchronizes the already registered invoice and attempt (using the deployed ABI's `get_invoice`, `register_invoice`, `get_attempt` and `register_attempt` methods), then calls `attest_settlement({input: ...})`. It queries `get_settlement` before every send and after a timeout or uncertain response. An exact existing record is marked delivered; a mismatch is blocked. Queue rows are leased with `FOR UPDATE SKIP LOCKED`, retried with capped exponential backoff, and ordered by invoice so partial receipts are attested before later receipts.

Only the deployed contract's supported CCTP route is eligible. Direct same-chain payments and multi-destination-transaction settlements are not attested by the current registry ABI.

## Migration and runtime setup

Apply `supabase/migrations/20261112120000_near_verified_settlement_outbox.sql` through the project's normal migration review/release process. This implementation has not applied it to any remote database. PostgreSQL integration tests require a dedicated **local** database with the project migrations, including this migration, applied; tests refuse non-local database URLs.

Configure these server-side variables in the deployment secret manager. The checked-in `.env.example` contains placeholders only:

| Variable | Value |
| --- | --- |
| `NEAR_NETWORK_ID` | `testnet` (the adapter rejects any other network) |
| `NEAR_RPC_URL` | `https://rpc.testnet.near.org` |
| `NEAR_CONTRACT_ID` | `noduss.testnet` |
| `NEAR_SIGNER_ACCOUNT_ID` | Existing funded testnet account, initially `noduss.testnet` |
| `NEAR_SIGNER_PRIVATE_KEY` | Server-only ed25519 key for that testnet account; never a public/client variable |
| `NEAR_OUTBOX_WORKER_SECRET` | High-entropy secret used only by the server and scheduled worker |

Schedule an authenticated `POST /api/internal/near-settlement-outbox` every minute or as appropriate for the host. Send `Authorization: Bearer <NEAR_OUTBOX_WORKER_SECRET>`. The CCTP verified settlement handler also attempts a small immediate drain, but the scheduled worker is required for reliable recovery after process or RPC failures. Do not put the worker secret in browser code or logs.

The currently deployed testnet configuration places owner, registrar and attestor roles on the same NODUS testnet account. This is a centralized testnet trust arrangement for integration testing, not production separation of duties. The backend must retain its PostgreSQL-first reconciliation and must not treat a NEAR attestation as the payment source of truth.

## Validation

`tests/near-settlement-payload.test.mjs` checks ABI payload construction and evidence rejection. `tests/near-outbox-delivery.test.mjs` checks deduplication, uncertain-send recovery, retries, conflicts and query failures. `tests/near-settlement-outbox.postgres.test.mjs` checks trigger idempotency, claim/retry/recovery and blocked evidence against a local PostgreSQL instance.
