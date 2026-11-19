"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getClientEnv, isClientSupabaseConfigured } from "@/config/env.client";
import type { Database } from "@/types/database";

let clientInstance: SupabaseClient<Database> | null = null;

/** Cookie-backed browser client for Supabase Auth and database access. */
export function getSupabaseBrowserClient(_legacyAccessToken?: string): SupabaseClient<Database> {
  if (clientInstance) return clientInstance;
  const env = getClientEnv();
  if (!isClientSupabaseConfigured()) throw new Error("Supabase is not configured.");
  clientInstance = createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  return clientInstance;
}
