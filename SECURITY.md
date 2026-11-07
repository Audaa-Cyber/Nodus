# NODUS Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this codebase, **do NOT open a public GitHub issue**.  
Contact the maintainer directly at the address listed in `package.json`.

---

## Secret Management Rules

| Rule | Detail |
|---|---|
| **Never commit secrets** | `.env`, `.env.local`, and all `.env.*` files are blocked by `.gitignore` and `.gitattributes` |
| **`NEXT_PUBLIC_` = public** | Only safe browser-visible values may use this prefix (Supabase URL and anon key) |
| **`SUPABASE_SERVICE_ROLE_KEY` = server-only** | Grants RLS bypass. Must never appear in client bundles. Enforced by `import "server-only"` |
| **`NEAR_SIGNER_PRIVATE_KEY` = server-only** | Blockchain signing key. Never prefix with `NEXT_PUBLIC_`, never import in client code |
| **Pre-commit hook** | `.husky/pre-commit` scans staged files for secret patterns and blocks the commit |
| **Pre-push hook** | `.husky/pre-push` does a final full-tree scan before any remote push |
| **Rotate on exposure** | If a key is ever committed or leaked: rotate it immediately in Supabase/NEAR dashboard — invalidating it takes priority over everything else |

---

## If a Secret Is Accidentally Committed

1. **Immediately rotate the key** in the Supabase dashboard (Settings → API) or NEAR account.
2. Remove the secret from the latest commit using `git rebase` or `git filter-repo`.
3. Force-push to overwrite history (coordinate with all collaborators).
4. Verify the secret is gone from **all branches and tags** using:
   ```bash
   git log --all -p | grep -i "the_leaked_value"
   ```
5. Check GitHub's "Secret scanning alerts" in the repository Security tab.

---

## Environment Variable Reference

| Variable | Scope | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + Server | ✅ Phase 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + Server | ✅ Phase 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | ✅ Phase 1 |
| `NEXT_PUBLIC_APP_URL` | Browser + Server | ✅ Phase 1 |
| `NEAR_NETWORK_ID` | **Server only** | Phase 2+ |
| `NEAR_RPC_URL` | **Server only** | Phase 2+ |
| `NEAR_INTENTS_CONTRACT_ID` | **Server only** | Phase 2+ |
| `NEAR_SIGNER_ACCOUNT_ID` | **Server only** | Phase 2+ |
| `NEAR_SIGNER_PRIVATE_KEY` | **Server only** | Phase 2+ |

Copy `.env.example` to `.env.local` and populate with real values. Never commit `.env.local`.

