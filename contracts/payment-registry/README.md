# NODUS Payment Registry

NEAR testnet registry for invoice payment terms, payment attempts, verified settlement attestations, and reconciliation outcomes. The contract is an audit mirror; PostgreSQL remains the application source of truth.

## State and methods

- `new(owner_id, registrar_id, initial_attestor)` initializes separate owner and registrar roles and one settlement attestor.
- `register_invoice(invoice_id, terms)` (registrar or owner) creates one immutable invoice with a contract-computed SHA-256 terms commitment. V1 accepts USD invoices paid in canonical USDC on Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, or Optimism Sepolia.
- `register_attempt(attempt_id, invoice_id, source_chain_id)` (registrar or owner) creates a unique attempt and commits to its UUID, invoice commitment, Base Sepolia source chain, and source USDC token.
- `attest_settlement(input)` (authorized attestor) records a backend-verified source/destination transaction pair once, after checking invoice and attempt bindings, token, recipient, amount, evidence digest, and replay keys. Exact cumulative payment marks the invoice `Paid`; partial payment leaves it `Open`; overpayment sets `ReviewRequired`.
- `add_attestor` and `remove_attestor` (owner) support overlap key rotation. Duplicate additions are idempotent, and the last authorized attestor cannot be removed.
- `get_invoice`, `get_attempt`, `get_settlement`, and `is_attestor` are public views.

IDs use canonical lowercase UUID strings; EVM addresses and hashes use lowercase hex. Amounts are integer base units (`U128` JSON decimal strings); USD invoice cents convert exactly to six-decimal USDC units. `EVENT_JSON:` logs follow NEP-297's standard/version/event/data envelope. Events contain registry identifiers, commitments, and settlement evidence summaries, never customer PII.

## Trust boundary

NEAR authenticates the calling attestor account but does not independently verify EVM receipts, Circle CCTP/IRIS messages, token transfers, or finality. The backend must independently verify the source burn and destination settlement on the recorded testnet before calling `attest_settlement`. An authorized attestor can submit a false claim if compromised. Protect and rotate the attestor key, and govern owner/registrar keys separately. The contract stores no customer PII and does not execute bridge transactions.

Payment settlement delivery is not atomic across PostgreSQL and NEAR. Backend integration should use an idempotent outbox keyed by reconciliation ID, query `get_settlement` after uncertain outcomes, and retry only the same canonical payload. Do not clear an on-chain reservation or issue a second attempt based solely on an ambiguous client or RPC error.

## Build and tests

Run from the repository root:

```powershell
cargo test --locked --manifest-path contracts/payment-registry/Cargo.toml
cargo near build non-reproducible-wasm --manifest-path contracts/payment-registry/Cargo.toml
cargo near abi --manifest-path contracts/payment-registry/Cargo.toml
```

Rust unit tests use the mocked NEAR runtime; they are not sandbox, RPC, or testnet integration tests. The build and ABI commands require `cargo-near`. No deployment is performed by these commands.
