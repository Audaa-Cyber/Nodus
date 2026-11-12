import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getClientEnv } from "@/config/env.client";
import type { Database } from "@/types/database";

/**
 * Creates an SSR-safe Supabase server client bound to the current request's cookies.
 *
 * CRITICAL SECURITY INVARIANT:
 * Enforced by "server-only". Cannot be bundled into client components.
 * Uses only public anon key with user session cookies, respecting Row Level Security (RLS).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = getClientEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL || "https://unconfigured.supabase.co",
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "unconfigured-anon-key",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if middleware is refreshing user sessions.
          }
        },
      },
    }
  );
}

/** Creates a request-independent anon client for public share-token RPCs.
 * Cookie-bound sessions can have the `authenticated` database role, while
 * narrowly scoped public invoice RPCs are intentionally granted to `anon`.
 */
export function createSupabaseAnonymousServerClient() {
  const env = getClientEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL || "https://unconfigured.supabase.co",
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "unconfigured-anon-key",
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

