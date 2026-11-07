import "server-only";
import { isClientSupabaseConfigured, normalizeSupabaseUrl } from "./env.client";

/**
 * Server-Only Environment Variable Validation & Access.
 * Contains privileged secrets (e.g., SUPABASE_SERVICE_ROLE_KEY).
 *
 * CRITICAL SECURITY INVARIANT:
 * Enforced by "server-only" import.
 * Attempting to import this module into a client component will halt compilation.
 */

export interface ServerEnv {
  NODE_ENV: "development" | "production" | "test";
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const PLACEHOLDER_INDICATORS = [
  "your-project",
  "placeholder",
  "your-service-role-key",
  "example",
];

function isPlaceholderValue(value: string | undefined): boolean {
  if (!value) return true;
  const lower = value.toLowerCase();
  return PLACEHOLDER_INDICATORS.some((indicator) => lower.includes(indicator));
}

/**
 * Checks whether server-side privileged Supabase credentials are fully configured.
 */
export function isServerSupabaseConfigured(): boolean {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return false;
  if (isPlaceholderValue(serviceRoleKey)) return false;
  return isClientSupabaseConfigured();
}

/**
 * Retrieves validated server environment variables.
 * Fails gracefully with explicit developer guidance when called if secrets are missing.
 */
export function getServerEnv(): ServerEnv {
  const nodeEnv = (process.env.NODE_ENV || "development") as ServerEnv["NODE_ENV"];
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  return {
    NODE_ENV: nodeEnv,
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  };
}

/**
 * Asserts that server Supabase service credentials are configured.
 * Throws a detailed developer error if credentials are missing or unconfigured.
 */
export function requireServerSupabaseEnv(): ServerEnv {
  const env = getServerEnv();

  if (!isServerSupabaseConfigured()) {
    throw new Error(
      "[NODUS CONFIG ERROR] SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is not configured.\n" +
      "Privileged server operations require valid credentials in .env.local.\n" +
      "Please refer to .env.example for required keys:\n" +
      "  NEXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co\n" +
      "  SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>\n"
    );
  }

  return env;
}

