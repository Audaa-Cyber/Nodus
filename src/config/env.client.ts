/**
 * Client-Safe Environment Variable Validation & Access.
 * Only variables prefixed with NEXT_PUBLIC_ are accessible here.
 * Safe to import into both Client ("use client") and Server components.
 */

export interface ClientEnv {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  NEXT_PUBLIC_APP_URL: string;
}

const PLACEHOLDER_INDICATORS = [
  "your-project",
  "placeholder",
  "your-anon-key",
  "example",
];

function isPlaceholderValue(value: string | undefined): boolean {
  if (!value) return true;
  const lower = value.toLowerCase();
  return PLACEHOLDER_INDICATORS.some((indicator) => lower.includes(indicator));
}

function isValidHttpUrl(urlString: string | undefined): boolean {
  if (!urlString) return false;
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Normalizes a Supabase URL by stripping accidental paths (such as `/rest/v1` or `/rest/v1/`)
 * and trailing slashes so both PostgREST and GoTrue Auth resolve correctly.
 */
export function normalizeSupabaseUrl(url: string | undefined): string {
  if (!url) return "";
  let trimmed = url.trim();
  trimmed = trimmed.replace(/\/+$/, "");
  trimmed = trimmed.replace(/\/rest\/v1\/?$/, "");
  return trimmed.replace(/\/+$/, "");
}

/**
 * Checks whether client-side Supabase credentials are configured with valid values.
 */
export function isClientSupabaseConfigured(): boolean {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return false;
  if (isPlaceholderValue(url) || isPlaceholderValue(anonKey)) return false;
  return isValidHttpUrl(url);
}

/**
 * Retrieves validated client environment variables.
 * Logs actionable developer instructions in development if credentials are missing or placeholders.
 */
export function getClientEnv(): ClientEnv {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const url = normalizeSupabaseUrl(rawUrl);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!isClientSupabaseConfigured()) {
    if (process.env.NODE_ENV === "development") {
      // Non-fatal warning in development to allow UI prototyping before Supabase keys are populated
      console.warn(
        "\n[NODUS ENV WARNING] Supabase client credentials are not configured.\n" +
        "Please create a .env.local file using .env.example as a template:\n" +
        "  NEXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co\n" +
        "  NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>\n"
      );
    }
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_APP_URL: appUrl,
  };
}

export const clientEnv = getClientEnv();

