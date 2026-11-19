import { createHash } from "node:crypto";
import { createSupabaseAnonymousServerClient } from "../supabase/server.ts";

/** Resolves the public invoice payment context and its immutable destination options. */
export async function lookupPublicPaymentContext(shareToken: string) {
  const tokenHash = createHash("sha256").update(shareToken, "utf8").digest("hex");
  const supabase = createSupabaseAnonymousServerClient();
  const [contextResult, optionsResult] = await Promise.all([
    supabase.rpc("lookup_shared_payment_context", { p_token_hash: tokenHash }),
    supabase.rpc("lookup_shared_payment_networks", { p_token_hash: tokenHash }),
  ]);
  return {
    context: contextResult.data?.[0] ?? null,
    options: optionsResult.data?.[0] ?? null,
    error: contextResult.error ?? optionsResult.error,
  };
}
