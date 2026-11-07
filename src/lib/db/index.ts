import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Database Access Layer Gateway.
 *
 * Provides a clean abstraction boundary between domain services and Supabase clients.
 *
 * NOTE (PHASE 1 SCOPE GATE):
 * Table creation and specific repository CRUD queries are strictly deferred to Phase 2.
 * This gateway establishes the architectural foundation and client access patterns.
 */
export class DatabaseGateway {
  /**
   * Retrieves an SSR server client bound to the current user request (RLS enforced).
   */
  public static async getClient(): Promise<SupabaseClient<Database>> {
    return createSupabaseServerClient();
  }

  /**
   * Retrieves the privileged Admin client (RLS bypassed).
   * Restricted to server background jobs and privileged operations.
   */
  public static getAdminClient(): SupabaseClient<Database> {
    return getSupabaseAdminClient();
  }
}

