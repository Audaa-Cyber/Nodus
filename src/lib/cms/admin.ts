import "server-only";

import { notFound } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/business-context";
import { requireServerSupabaseEnv } from "@/config/env.server";
import { createClient } from "@supabase/supabase-js";

export async function getCmsAdmin() {
  const user = await getVerifiedUser();
  const allowlist = (process.env.CMS_ADMIN_WORKOS_SUBJECTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!user || !allowlist.includes(user.id)) return null;
  return user;
}

export async function requireCmsAdmin() {
  const admin = await getCmsAdmin();
  if (!admin) notFound();
  return admin;
}

export function createCmsServiceClient() {
  const env = requireServerSupabaseEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
