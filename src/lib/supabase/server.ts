import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getClientEnv } from "@/config/env.client";
import type { Database } from "@/types/database";

/** Server client authenticated by the request's WorkOS access token. */
export async function createSupabaseServerClient(accessToken?: string) {
  const env = getClientEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL || "https://unconfigured.supabase.co",
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "unconfigured-anon-key",
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      ...(accessToken ? { accessToken: async () => accessToken } : {}),
    },
  );
}

/** Anonymous client for narrowly scoped public invoice/share RPCs. */
export function createSupabaseAnonymousServerClient() {
  const env = getClientEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL || "https://unconfigured.supabase.co",
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "unconfigured-anon-key",
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
