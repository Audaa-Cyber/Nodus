import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getClientEnv, isClientSupabaseConfigured } from "@/config/env.client";
import type { Database } from "@/types/database";

let clientInstance: SupabaseClient<Database> | null = null;
let clientAccessToken: string | null = null;

/** Browser Supabase client authenticated with the current WorkOS JWT. */
export function getSupabaseBrowserClient(accessToken: string): SupabaseClient<Database> {
  if (!accessToken) throw new Error("A WorkOS access token is required for authenticated Supabase access.");
  if (clientInstance && clientAccessToken === accessToken) return clientInstance;
  const env = getClientEnv();
  if (!isClientSupabaseConfigured()) throw new Error("Supabase is not configured.");
  clientAccessToken = accessToken;
  clientInstance = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    accessToken: async () => accessToken,
  });
  return clientInstance;
}
