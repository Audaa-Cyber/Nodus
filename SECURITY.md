# Security

## Reporting a vulnerability

Report security issues privately to the repository maintainers. Use GitHub's private vulnerability reporting for this repository if it is enabled; otherwise contact the maintainers directly. Do not post credentials, exploit details, or customer data in a public issue.

## Credentials

- `NEXT_PUBLIC_` values are browser-visible. Use this prefix only for values intended to be public, such as the Supabase URL and anon key.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `CIRCLE_API_KEY`, `NEAR_SIGNER_PRIVATE_KEY`, and `NEAR_OUTBOX_WORKER_SECRET` on the server. The Supabase service-role key bypasses RLS.
- Keep real credentials in `.env.local` or the deployment secret manager. `.env.example` is a template; replace its placeholder values locally and never commit real keys.
- If a credential is exposed, revoke or rotate it with its provider immediately, then remove it from files and coordinate any required history cleanup.

The Husky pre-commit and pre-push hooks scan staged or tracked source for selected secret patterns. These checks are safeguards and do not replace provider-side key controls or review.
