import "server-only";

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthenticatedUser = {
  id: string;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
};

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

const getSupabase = cache(async () => createSupabaseServerClient());

export function invalidateBusinessProfileCache(_userId: string) {
  // React cache is request-scoped; no cross-user profile cache is retained.
}

export const getVerifiedUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const metadata = data.user.user_metadata ?? {};
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name : "";
  const givenName = typeof metadata.given_name === "string" ? metadata.given_name : "";
  const familyName = typeof metadata.family_name === "string" ? metadata.family_name : "";
  const nameParts = fullName.trim().split(/\s+/).filter(Boolean);

  return {
    id: data.user.id,
    email: data.user.email ?? undefined,
    firstName: givenName || nameParts[0] || null,
    lastName: familyName || nameParts.slice(1).join(" ") || null,
  };
});

export const getBusinessContext = cache(async () => {
  const supabase = await getSupabase();
  const user = await getVerifiedUser();
  if (!user) return { supabase, user: null, business: null };

  const columns = "id,owner_user_id,business_name,email,receiving_address,receiving_network,receiving_networks,logo_url,business_phone,business_address,website_url,tax_registration_number,invoice_prefix,next_invoice_number,default_currency,default_payment_terms_days,invoice_footer,created_at,updated_at";
  let { data: business } = await supabase
    .from("business_profiles")
    .select(columns)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!business && user.email) {
    const metadata = (await supabase.auth.getUser()).data.user?.user_metadata ?? {};
    const metadataBusinessName = typeof metadata.business_name === "string" ? metadata.business_name.trim() : "";
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    const { data: created } = await supabase
      .from("business_profiles")
      .upsert({
        owner_user_id: user.id,
        business_name: metadataBusinessName || displayName || "My business",
        email: user.email,
      }, { onConflict: "owner_user_id", ignoreDuplicates: true })
      .select(columns)
      .maybeSingle();

    business = created;
    if (!business) {
      const retry = await supabase.from("business_profiles")
        .select(columns)
        .eq("owner_user_id", user.id)
        .maybeSingle();
      business = retry.data;
    }
  }

  return { supabase, user, business: (business as BusinessProfile | null) ?? null };
});
