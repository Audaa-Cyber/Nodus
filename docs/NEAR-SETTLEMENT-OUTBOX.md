# NEAR verified settlement outbox

## Trust boundary and flow

The authoritative event is the server-side `record_payment_reconciliation` RPC call in the CCTP attempt status handler. Before that call, the server independently correlates Circle's CCTP V2 message with source-chain events, verifies the destination MessageReceived event and merchant USDC transfer, and checks destination finality. The browser submits only an attempt identifier; the browser cannot insert into `payment_settlements` or `near_settlement_outbox`.

An `AFTER INSERT` trigger on `payment_settlements` creates one private outbox row for eligible Circle CCTP USDC settlements between Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, and Optimism Sepolia. It records the settlement/reconciliation UUID, invoice UUID, attempt UUID, source transaction hash and destination transaction hashes. Rows without the verifier metadata required by the deployed contract ABI are created blocked for review. The database unique constraints make reconciliation replay idempotent. PostgreSQL settlement records remain the source of truth.

The worker synchronizes the already registered invoice and attempt (using the deployed ABI's `get_invoice`, `register_invoice`, `get_attempt` and `register_attempt` methods), then calls `attest_settlement({input: ...})`. It queries `get_settlement` before every send and after a timeout or uncertain response. An exact existing record is marked delivered; a mismatch is blocked. Queue rows are leased with `FOR UPDATE SKIP LOCKED`, retried with capped exponential backoff, and ordered by invoice so partial receipts are attested before later receipts.

Verified direct same-chain USDC settlements are also eligible after applying `20261117120000_same_chain_settlement.sql`. They use the same outbox and readback checks. The payload uses verifier policy version 2 and transaction-derived identifiers in the `NODUS_DIRECT_USDC_V1` namespace for the existing ABI's nonce/message fields; these identifiers are not CCTP evidence. Independent ERC-20 destination verification is the authority for direct payments. Multi-destination-transaction settlements remain unsupported. See [same-chain payments](SAME-CHAIN-PAYMENTS.md).

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

During `npm run dev`, `src/instrumentation.ts` automatically starts a recovery loop when the NEAR signer private key and Supabase service-role key are configured. It drains up to five invoice registrations followed by up to five settlements on startup, then waits 30 seconds after each completed pass before trying again. Failed dispatches are retried on the next pass, and slow passes never overlap in the same process. Database leases coordinate separate processes. Production still requires scheduling both authenticated POST endpoints; the development timer is disabled there.

Authenticated `GET /api/internal/near-settlement-outbox` checks database access, NEAR client configuration, and contract readback without claiming jobs or signing transactions. It checks the oldest pending reconciliation, or a missing-record probe when the queue is empty. Failures return HTTP 503 with the failing stage and a safe error code. Readiness confirms read access and configuration, not signer funding or write permissions.

Issued invoices are durably queued by the invoice trigger in `near_invoice_registration_outbox`. The invoice action makes a best-effort immediate drain after saving; schedule authenticated `POST /api/internal/near-invoice-registration-outbox` with the same bearer secret for retries and recovery. Invoice registration has its own `pending`, `submitting`, `registered`, and `failed` state on the invoice. A `registered` state requires a final NEAR transaction and a matching `get_invoice` readback. Failed invoices can be requeued by their owner from the invoice detail page. Only invoice terms and the merchant's receiving address are written on-chain; customer details remain in Supabase.

The currently deployed testnet configuration places owner, registrar and attestor roles on the same NODUS testnet account. This is a centralized testnet trust arrangement for integration testing, not production separation of duties. The backend must retain its PostgreSQL-first reconciliation and must not treat a NEAR attestation as the payment source of truth.

## Evidence eligibility and CCTP V2 format

Settlement evidence stored in PostgreSQL must satisfy `public.near_settlement_evidence_eligible` before an outbox job transitions to `pending` delivery:
- Source and destination chains must be supported testnets (Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, or Optimism Sepolia).
- The CCTP nonce in `sourceProof.nonce` can be either a decimal string or a standard 32-byte hexadecimal string (`0x` followed by 64 hex characters) as emitted by Circle CCTP V2.
- The `destinationProof` must include confirmed finality, valid transaction hashes, and a matching message hash.

Migration `supabase/migrations/20261116000000_fix_near_evidence_ineligible_outbox.sql` ensures that CCTP V2 32-byte hex nonces are recognized by the eligibility validator and prevents valid cross-chain settlements from being blocked.

## Validation

`tests/near-evidence-eligibility.test.mjs` checks nonce parsing and evidence eligibility criteria across all supported networks. `tests/near-settlement-payload.test.mjs` checks ABI payload construction and evidence rejection. `tests/near-outbox-delivery.test.mjs` checks deduplication, uncertain-send recovery, retries, conflicts and query failures. `tests/near-settlement-outbox.postgres.test.mjs` checks trigger idempotency, claim/retry/recovery and blocked evidence against a local PostgreSQL instance.

`tests/near-local-worker.test.mjs` checks recovery after failed dispatch, serial execution, and cancellation. `tests/near-worker-route.test.mjs` checks authenticated readiness and dispatch, empty-queue RPC failure, read-only probes, and safe error responses.
