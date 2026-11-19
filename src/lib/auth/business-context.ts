import "server-only";
import { cache } from "react";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type WorkOSUser = { id: string; email?: string; firstName?: string | null; lastName?: string | null };

export type BusinessProfile = {
  id: string;
  owner_user_id: string;
  business_name: string;
  email: string;
  receiving_address: string | null;
  receiving_network: string | null;
  receiving_networks: string[];
  logo_url?: string | null;
  business_phone?: string | null;
  business_address?: string | null;
  website_url?: string | null;
  tax_registration_number?: string | null;
  invoice_prefix?: string;
  next_invoice_number?: number;
  default_currency?: string;
  default_payment_terms_days?: number;
  invoice_footer?: string;
  created_at: string;
  updated_at: string;
};

const profileCache = new Map<string, { profile: BusinessProfile | null; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

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
    for (const [key, val] of profileCache.entries()) if (now > val.expiresAt) profileCache.delete(key);
  }
  profileCache.set(userId, { profile, expiresAt: Date.now() + CACHE_TTL_MS });
}

const getWorkOSSession = cache(async () => withAuth());

export const getVerifiedUser = cache(async (): Promise<WorkOSUser | null> => {
  const { user } = await getWorkOSSession();
  if (!user) return null;
  return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName };
});

export const getBusinessContext = cache(async () => {
  const { user: workosUser, accessToken } = await getWorkOSSession();
  const user: WorkOSUser | null = workosUser
    ? { id: workosUser.id, email: workosUser.email, firstName: workosUser.firstName, lastName: workosUser.lastName }
    : null;
  const supabase = await createSupabaseServerClient(accessToken ?? undefined);
  if (!user || !accessToken) return { supabase, user: null, business: null };

  const cached = getCachedProfile(user.id);
  if (cached !== undefined) return { supabase, user, business: cached };

  let { data: business } = await supabase
    .from("business_profiles")
    .select("id,owner_user_id,business_name,email,receiving_address,receiving_network,receiving_networks,logo_url,business_phone,business_address,website_url,tax_registration_number,invoice_prefix,next_invoice_number,default_currency,default_payment_terms_days,invoice_footer,created_at,updated_at")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  // WorkOS owns user creation. Provision the merchant profile on first authenticated visit.
  if (!business && user.email) {
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    const { data: created } = await supabase
      .from("business_profiles")
      .upsert({
        owner_user_id: user.id,
        business_name: displayName || "My business",
        email: user.email,
      }, { onConflict: "owner_user_id", ignoreDuplicates: true })
      .select("id,owner_user_id,business_name,email,receiving_address,receiving_network,receiving_networks,logo_url,business_phone,business_address,website_url,tax_registration_number,invoice_prefix,next_invoice_number,default_currency,default_payment_terms_days,invoice_footer,created_at,updated_at")
      .maybeSingle();
    business = created;
    if (!business) {
      const retry = await supabase.from("business_profiles")
        .select("id,owner_user_id,business_name,email,receiving_address,receiving_network,receiving_networks,logo_url,business_phone,business_address,website_url,tax_registration_number,invoice_prefix,next_invoice_number,default_currency,default_payment_terms_days,invoice_footer,created_at,updated_at")
        .eq("owner_user_id", user.id).maybeSingle();
      business = retry.data;
    }
  }

  const businessProfile = (business as BusinessProfile | null) ?? null;
  setCachedProfile(user.id, businessProfile);
  return { supabase, user, business: businessProfile };
});
