import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireServerSupabaseEnv } from "@/config/env.server";
import type { Database } from "@/types/database";

let adminClientInstance: SupabaseClient<Database> | null = null;

/**
 * Returns a privileged Supabase Admin client utilizing SUPABASE_SERVICE_ROLE_KEY.
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. Isolated strictly to server runtime environments via "server-only".
 * 2. Bypasses Row Level Security (RLS) - use ONLY for background jobs, privileged webhooks,
 *    or server-side admin management tasks.
 * 3. Session persistence and auto-refresh are strictly disabled.
 * 4. NEVER import or reference in any client component.
 */
export function getSupabaseAdminClient(): SupabaseClient<Database> {
  if (adminClientInstance) {
    return adminClientInstance;
  }

  const env = requireServerSupabaseEnv();

  adminClientInstance = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  return adminClientInstance;
}

