/**
 * Client-safe environment validation and access.
 * Publishable Supabase keys are designed for browser use and rely on RLS.
 */
export interface ClientEnv {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  NEXT_PUBLIC_APP_URL: string;
}

const PLACEHOLDER_INDICATORS = ["your-project", "placeholder", "your-anon-key", "example"];

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

export function normalizeSupabaseUrl(url: string | undefined): string {
  if (!url) return "";
  return url.trim().replace(/\/+$/, "").replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
}

export function isClientSupabaseConfigured(): boolean {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && !isPlaceholderValue(url) && !isPlaceholderValue(key) && isValidHttpUrl(url));
}

export function getClientEnv(): ClientEnv {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!isClientSupabaseConfigured() && process.env.NODE_ENV === "development") {
    console.warn(
      "\n[NODUS ENV WARNING] Supabase credentials are not configured. Add these to .env.local:\n" +
      "  NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co\n" +
      "  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...\n",
    );
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: key,
    NEXT_PUBLIC_APP_URL: appUrl,
  };
}

export const clientEnv = getClientEnv();
