# Tidepool testnet environment

Tidepool records must use the repository's local Supabase stack. The hosted NODUS project remains production and must not receive testnet data or migrations.

## Local Supabase readiness

The repository has `supabase/config.toml` configured for PostgreSQL 17, Auth, the Data API, Storage, Realtime, Studio, local email capture, Edge Runtime, and Analytics. The five existing MVP migrations are in `supabase/migrations/` and use `auth.users`, PostgreSQL extensions/functions, RLS, and application tables, which the local Supabase stack is designed to provide.

The seed configuration previously referenced `supabase/seed.sql`, which does not exist. Seeding is now disabled so a local schema reset only replays migrations and does not fail on a missing seed file.

The Supabase CLI 3.0.0 is installed in the repo. **Docker is not installed or available in the current environment**, so I could not start the local stack or verify migration application. Supabase documents Docker Desktop as the recommended Windows runtime; compatible alternatives include Rancher Desktop and Podman. I have not installed anything.

After a Docker-compatible runtime is available, use only local commands:

```powershell
$env:SUPABASE_TELEMETRY_DISABLED = '1'
npx supabase start
npx supabase db reset --local --no-seed
npx supabase status
```

`db reset --local` recreates the **local** database and applies migrations in timestamp order. Do not add `--remote` or `--linked`, and do not use `supabase db push` for this work. This repository contains Supabase CLI link metadata for the hosted project; local test mode rejects hosted Supabase URLs, but the operator must still use the explicit `--local` command above. Supabase describes `db reset` as local by default and `--remote` as destructive against the linked target ([local/hosted command behavior](https://supabase.com/docs/guides/local-development/local-and-hosted-projects), [CLI reset reference](https://supabase.com/docs/reference/cli/supabase-db-reset)).

## Local test environment variables

Copy the local API URL and keys printed by `npx supabase status` into the untracked `.env.local` file. The CLI may print current publishable/secret keys as well as legacy anon/service-role keys; use a local publishable or anon key for the browser and a local secret or service-role key for server-only admin operations.

```dotenv
PAYMENT_MODE=tidepool_testnet
SUPABASE_ENVIRONMENT=tidepool_testnet_local

NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-publishable-or-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<local-secret-or-service-role-key>

TIDEPOOL_API_BASE_URL=https://www.usetidepool.tech
TIDEPOOL_DEPOSITS_ENABLED=false
TIDEPOOL_QUOTE_SIGNATURE_VERIFICATION=unconfirmed
TIDEPOOL_MAKER_PUBLIC_KEY=

LIVE_PAYMENT_ENABLED=false
ONE_CLICK_JWT=
```

The local API URL and keys must come from the local CLI output; do not copy hosted credentials. `SUPABASE_SERVICE_ROLE_KEY` stays server-side. The Tidepool config guard accepts only the explicit `tidepool_testnet_local` marker and the configured loopback API host/port. It rejects hosted URLs and refuses to enable production live payments. Tidepool deposits remain hard-disabled in code regardless of environment flags.

## Quote signature blocker

Tidepool's quote docs describe an `ed25519:` signature made by the maker over the quote body, but do not publish the quote-signing public key or exact signed-byte/canonicalization rules. The docs-linked public examples describe funding, NEP-413 authorization, and status polling; they do not establish a quote-signature verification contract. Tidepool's own FAQ says its server source is in a private repository, so there is no public implementation to inspect. A maker-account access key checked previously did not verify the sample quote. The 1Click verifier cannot be substituted for Tidepool's maker key.

Before accepting a quote, Tidepool's maintainer must provide the public key and rotation/version rules, the precise fields and serialization/encoding covered by the signature, and a valid plus tampered quote test vector. See [quote signature documentation](https://www.usetidepool.tech/docs/concepts/quotes), [quote API reference](https://www.usetidepool.tech/docs/api-reference/get-quote), [OpenAPI spec](https://www.usetidepool.tech/openapi.json), the [public first-swap example](https://github.com/Watchmeecryt/tidepool-examples), and Tidepool's [FAQ](https://www.usetidepool.tech/docs/resources/faq).
