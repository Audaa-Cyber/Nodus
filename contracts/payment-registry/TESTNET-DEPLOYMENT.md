# NODUS Payment Registry — testnet deployment

Recorded 2026-11-11. Testnet only.

## Deployment

| Item | Result |
| --- | --- |
| Network | NEAR testnet |
| Account and contract ID | `noduss.testnet` |
| Deployment and initialization transaction | `9VELG71RCvK57FgZ6TsLM7GJPb2pAPP1RAQQfpzZT9JF` |
| Initialization | Succeeded in the deployment transaction |
| Owner | `noduss.testnet` |
| Registrar | `noduss.testnet` |
| Initial attestor | `noduss.testnet` |
| Testnet trust model | Centralized: the existing account holds all three roles |
| Final balance | `9.9973603068297852 NEAR` |
| Contract storage reported | `212.7 KB` |

The centralized role assignment is for testnet testing only. Production should separate owner, registrar, and settlement attestor authority and use the project’s operational key controls.

## Build and ABI

- Optimized WASM: `artifacts-final/nodus_payment_registry.wasm`
- WASM size: `210,439` bytes
- SHA-256: `68af60a69dbb6a82bac83c51766b096b16318034509648c7656517c51150f11a`
- ABI: `abi/nodus_payment_registry_abi.json` (`16,409` bytes)
- ABI generated with `cargo near abi --features near-sdk/unit-testing`. The standalone ABI is valid; the deployed optimized WASM was built with `--no-abi`.

## Verification

All 19 Rust integration tests passed. They cover registrar authorization, attestor authorization, invoice and attempt commitments, settlement, duplicate attempt/reconciliation/EVM transaction/CCTP message rejection, invalid transitions, last-attestor protection, and NEP-297 events.

The initialized attestor view returned `true`. A synthetic invoice, attempt, and settlement were then registered on testnet:

| Operation | Transaction |
| --- | --- |
| Register invoice `00000000-0000-4000-8000-000000000001` | `3PyV1B89rQv5Y3tXp8SEmJj8UzqpKwA4xRSdaVZUZmum` |
| Register attempt `00000000-0000-4000-8000-000000000002` | `GDY1P28vG3DP53r9zn5wDDz2xu5c4Mqt1Qj4biva7nGS` |
| Attest settlement `00000000-0000-4000-8000-00000000000b` | `Gs8XABJyawvgyp3KdY6PG44WCJWX7BZDXWzs7EawwN95` |

Read-only views confirmed the invoice is `Paid`, the attempt is `SettlementRecorded`, and the settlement outcome is `Verified`. Registration and attestation emitted `EVENT_JSON` events under `nodus_payment_registry` version `1.0.0`.

**The settlement fixture is synthetic.** Its EVM transaction hashes, block hashes, CCTP message, and evidence digest are test values, not proof of a real transfer or bridge settlement. The contract authenticates the NEAR attestor and checks the supplied commitments; the backend must verify source and destination chain evidence before submitting attestations.

## Cost

The account had `10 NEAR` before deployment. After deployment, initialization, invoice and attempt registration, and settlement testing, it held `9.9973603068297852 NEAR`. The observed total spend was about `0.00264 NEAR`, including the failed first settlement-call attempt. No additional account or storage deposit was created. This is below the stated `8 NEAR` spending limit.

## Remaining backend integration

- Independently verify canonical USDC transfer/burn, Circle CCTP message, destination receipt, recipient, amount, and finality on the source and destination testnets before attesting. The current contract allowlist is Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, and Optimism Sepolia.
- Deliver attestations from the authorized backend signer using an idempotent outbox keyed by reconciliation ID.
- On uncertain RPC outcomes, query `get_settlement` before retrying; retry only the same canonical payload.
- Keep PostgreSQL as the application source of truth and reconcile it against NEAR; this deployment does not change Supabase or Circle payment code.
- Before production, separate the three roles, rotate away from testnet credentials, and complete operational key-rotation procedures.
