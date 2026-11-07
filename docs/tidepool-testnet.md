# Tidepool testnet environment

Tidepool must run against a dedicated Supabase project. Do not point testnet mode at the existing production project.

## Supabase project setup

Create a new Supabase project named for NODUS Tidepool testing. Apply the current NODUS schema and migrations to that project only. In the project settings, copy its Project URL, anon/publishable key, and service-role/secret key into a local, untracked `.env.local` file. The service role key must remain server-side.

Use the project URL's subdomain as `TIDEPOOL_TEST_PROJECT_REF`. The application-side guard checks that this reference matches the Supabase URL before it returns Tidepool configuration.
Set `SUPABASE_PRODUCTION_PROJECT_REF` to the subdomain of the existing production Supabase URL; the guard rejects Tidepool mode if the two references match.

Required variables:

```dotenv
PAYMENT_MODE=tidepool_testnet
SUPABASE_ENVIRONMENT=tidepool_testnet
TIDEPOOL_TEST_PROJECT_REF=<dedicated-test-project-ref>
SUPABASE_PRODUCTION_PROJECT_REF=<existing-production-project-ref>

NEXT_PUBLIC_SUPABASE_URL=https://<dedicated-test-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-or-publishable-key-from-that-test-project>
SUPABASE_SERVICE_ROLE_KEY=<service-role-or-secret-key-from-that-test-project>

TIDEPOOL_API_BASE_URL=https://www.usetidepool.tech
TIDEPOOL_DEPOSITS_ENABLED=false
TIDEPOOL_QUOTE_SIGNATURE_VERIFICATION=unconfirmed
TIDEPOOL_MAKER_PUBLIC_KEY=

LIVE_PAYMENT_ENABLED=false
ONE_CLICK_JWT=
```

Never add `NEXT_PUBLIC_` to a service-role key, Tidepool credential, RPC credential, or any private key. Tidepool's documented quote endpoint does not require an API credential; do not invent one. `ONE_CLICK_JWT` remains exclusively for the existing production 1Click integration.

The `tidepool-config` helper currently validates the selected mode, explicit test environment marker, project URL/ref match, and fixed Tidepool API origin. Deposit readiness is hard-disabled in code; environment toggles alone cannot enable it. No existing API route consumes this configuration, so this scaffolding does not create quotes or deposits.

## Current implementation boundary

Mock remains the default. Production live mode and its configuration are unchanged. The Tidepool integration is not yet enabled: the maker public key and exact bytes/canonical serialization covered by its Ed25519 signature have not been published in the docs located so far. Do not set the signature confirmation or deposit flag until Tidepool's maintainer confirms those values. Testnet invoice/payment schema migrations must be applied to the dedicated test project only after the mode-specific schema design is ready; no migration has been applied by this scaffold.

Tidepool documents its API at `https://www.usetidepool.tech/openapi.json`; this is an API specification, not the maker's signing implementation or a public quote-verification key. See the official [quote signature documentation](https://www.usetidepool.tech/docs/concepts/quotes), [quote API reference](https://www.usetidepool.tech/docs/api-reference/get-quote), [trust model](https://www.usetidepool.tech/docs/resources/trust-model), and the [public Tidepool examples](https://github.com/Watchmeecryt/tidepool-examples). The documented first-swap example signs a NEP-413 deposit intent; its published description does not establish the separate quote signature verification contract needed by NODUS.
