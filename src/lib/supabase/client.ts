import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getClientEnv, isClientSupabaseConfigured } from "@/config/env.client";
import type { Database } from "@/types/database";

let clientInstance: SupabaseClient<Database> | null = null;

/**
 * Returns a singleton browser Supabase client instance.
 * Safe for use inside React Client Components ("use client").
 *
 * Employs ONLY NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * Never leaks server secrets.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (clientInstance) {
    return clientInstance;
  }

  const env = getClientEnv();

  if (!isClientSupabaseConfigured()) {
    // If unconfigured, provide a fallback instance using mock keys so component rendering
    // does not throw unhandled exceptions during initial setup / prototyping.
    clientInstance = createBrowserClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL || "https://unconfigured.supabase.co",
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "unconfigured-anon-key"
    );
    return clientInstance;
  }

  clientInstance = createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return clientInstance;
}

