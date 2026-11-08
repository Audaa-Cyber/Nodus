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

  const cached = getCachedProfile(user.id);
  if (cached !== undefined) {
    return { supabase, user, business: cached };
  }

  const { data: business } = await supabase
    .from("business_profiles")
    .select("id,business_name,email,receiving_address,receiving_network,created_at,updated_at")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  const businessProfile = (business as BusinessProfile | null) ?? null;
  setCachedProfile(user.id, businessProfile);

  return { supabase, user, business: businessProfile };
});
