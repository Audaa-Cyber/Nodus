import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BusinessProfile = {
  id: string;
  business_name: string;
  email: string;
  receiving_address: string | null;
  receiving_network: string | null;
  logo_url?: string | null; business_phone?: string | null; business_address?: string | null; website_url?: string | null; tax_registration_number?: string | null; invoice_prefix?: string; next_invoice_number?: number; default_currency?: string; default_payment_terms_days?: number; invoice_footer?: string;
  created_at: string;
  updated_at: string;
};

// In-memory bounded cache for business profiles to avoid repetitive ~1s DB roundtrips on tab navigation.
const profileCache = new Map<string, { profile: BusinessProfile | null; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 60 seconds TTL

function getCachedProfile(userId: string): BusinessProfile | null | undefined {
  const entry = profileCache.get(userId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    profileCache.delete(userId);
    return undefined;
  }
  return entry.profile;
}

export function invalidateBusinessProfileCache(userId: string) {
  profileCache.delete(userId);
}

function setCachedProfile(userId: string, profile: BusinessProfile | null) {
  if (profileCache.size > 200) {
    const now = Date.now();
    for (const [key, val] of profileCache.entries()) {
      if (now > val.expiresAt) profileCache.delete(key);
    }
  }
  profileCache.set(userId, { profile, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Resolve the verified user for the current request, deduped via React's
 * request-scoped cache. Prefers the request headers set by middleware (zero
 * network); falls back to a Supabase auth call only when they are absent.
 *
 * Splitting this out of getBusinessContext lets the dashboard layout gate on the
 * (fast, local) user without serializing on the business_profiles query.
 */
export const getVerifiedUser = cache(async (): Promise<User | null> => {
  try {
    const headerList = await headers();
    if (headerList.get("x-nodus-demo-mode") === "true" &&
        process.env.NODE_ENV === "development" &&
        process.env.NODUS_DEV_AUTH_BYPASS === "true") {
      return {
        id: "00000000-0000-4000-8000-000000000001",
        email: "demo@nodus.local",
        app_metadata: {},
        user_metadata: { business_name: "Offlines Demo" },
        aud: "authenticated",
        created_at: "2026-01-01T00:00:00.000Z",
      } as User;
    }
  } catch {
    // Continue with the regular Supabase session lookup.
  }

  try {
    const headerList = await headers();
    const verifiedUserId = headerList.get("x-user-id");
    const verifiedUserEmail = headerList.get("x-user-email");

    if (verifiedUserId) {
      return {
        id: verifiedUserId,
        email: verifiedUserEmail || undefined,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
      } as User;
    }
  } catch {
    // If headers() is unavailable or throws, proceed to direct client fallback
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data?.user ?? null;
  } catch {
    return null;
  }
});

/**
 * Share the verified user and their business profile across the dashboard layout
 * and page during one server render. React cache is request-scoped, so this never
 * reuses a business context across users or requests.
 */
export const getBusinessContext = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const user = await getVerifiedUser();
  if (!user) return { supabase, user: null, business: null };

  try {
    const headerList = await headers();
    if (headerList.get("x-nodus-demo-mode") === "true" &&
        process.env.NODE_ENV === "development" &&
        process.env.NODUS_DEV_AUTH_BYPASS === "true") {
      const demoBusiness: BusinessProfile = {
        id: "00000000-0000-4000-8000-000000000002",
        business_name: "Offlines Demo",
        email: "demo@nodus.local",
        receiving_address: null,
        receiving_network: "base-sepolia",
        logo_url: null,
        business_phone: null,
        business_address: "Addis Ababa, Ethiopia",
        website_url: null,
        tax_registration_number: null,
        invoice_prefix: "DEMO",
        next_invoice_number: 1,
        default_currency: "USDC",
        default_payment_terms_days: 7,
        invoice_footer: "Demo workspace",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      };
      return { supabase, user, business: demoBusiness };
    }
  } catch {
    // Continue with the regular database-backed business profile.
  }

  const cached = getCachedProfile(user.id);
  if (cached !== undefined) {
    return { supabase, user, business: cached };
  }

  const { data: business } = await supabase
    .from("business_profiles")
    .select("id,business_name,email,receiving_address,receiving_network,logo_url,business_phone,business_address,website_url,tax_registration_number,invoice_prefix,next_invoice_number,default_currency,default_payment_terms_days,invoice_footer,created_at,updated_at")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  const businessProfile = (business as BusinessProfile | null) ?? null;
  setCachedProfile(user.id, businessProfile);

  return { supabase, user, business: businessProfile };
});
