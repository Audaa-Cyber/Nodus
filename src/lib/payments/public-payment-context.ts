import { createHash } from "node:crypto";
import { createSupabaseAnonymousServerClient } from "../supabase/server.ts";

/** Resolves a public invoice context using only the share token from the URL. */
export async function lookupPublicPaymentContext(shareToken: string) {
  const tokenHash = createHash("sha256").update(shareToken, "utf8").digest("hex");
  const { data, error } = await createSupabaseAnonymousServerClient().rpc("lookup_shared_payment_context", {
    p_token_hash: tokenHash,
  });
  return { context: data?.[0] ?? null, error };
}
