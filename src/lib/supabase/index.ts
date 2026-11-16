/**
 * Central Supabase Module Exports.
 *
 * Browser client:
 *   import { getSupabaseBrowserClient } from "@/lib/supabase";
 *
 * Server SSR client (Server Components, Server Actions, Route Handlers):
 *   import { createSupabaseServerClient } from "@/lib/supabase/server";
 *
 * Privileged Admin client (Service Role - Server Only):
 *   import { getSupabaseAdminClient } from "@/lib/supabase/admin";
 */

export { getSupabaseBrowserClient } from "./client";
export type { Database, Json } from "@/types/database";

