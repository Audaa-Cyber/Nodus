import "server-only";

import { notFound } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/business-context";
import { requireServerSupabaseEnv } from "@/config/env.server";
import { createClient } from "@supabase/supabase-js";

export type CmsAdminRole = "owner" | "admin" | "editor" | "analyst";
export type CmsAdmin = {
  id: string;
  supabaseUserId: string;
  email: string;
  displayName: string | null;
  role: CmsAdminRole;
  isActive: boolean;
  firstName?: string | null;
  lastName?: string | null;
};

export async function getCmsAdmin(): Promise<CmsAdmin | null> {
  const user = await getVerifiedUser();
  if (!user) return null;

  // Role assignments live in Supabase. The environment allowlist is only a
  // one-time bootstrap gate for the first owner, never a permanent bypass.
  let db: ReturnType<typeof createCmsServiceClient>;
  try { db = createCmsServiceClient(); } catch { return null; }
  const { data: existing, error } = await db
    .from("cms_admin_users")
    .select("id,supabase_user_id,email,display_name,role,is_active")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  if (error) return null;
  if (existing) {
    if (!existing.is_active) return null;
    return {
      id: existing.id,
      supabaseUserId: existing.supabase_user_id,
      email: existing.email,
      displayName: existing.display_name,
      role: existing.role as CmsAdminRole,
      isActive: existing.is_active,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  const bootstrapSubjects = (process.env.CMS_ADMIN_SUPABASE_USER_IDS ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const bootstrapEmails = (process.env.CMS_ADMIN_EMAILS ?? "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const normalizedEmail = user.email?.trim().toLowerCase() ?? "";
  if (!bootstrapSubjects.includes(user.id) && (!normalizedEmail || !bootstrapEmails.includes(normalizedEmail))) return null;

  const email = user.email?.trim();
  if (!email) return null;

  const { error: bootstrapError } = await db.rpc("nodus_cms_bootstrap_owner", {
    p_supabase_user_id: user.id,
    p_email: email,
    p_display_name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
  });
  if (bootstrapError) return null;

  // The RPC serializes first-owner creation. Re-read the role record rather
  // than trusting the bootstrap return value or keeping an environment bypass.
  const { data: bootstrapped, error: readError } = await db
    .from("cms_admin_users")
    .select("id,supabase_user_id,email,display_name,role,is_active")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  if (readError || !bootstrapped || !bootstrapped.is_active) return null;
  return {
    id: bootstrapped.id,
    supabaseUserId: bootstrapped.supabase_user_id,
    email: bootstrapped.email,
    displayName: bootstrapped.display_name,
    role: bootstrapped.role as CmsAdminRole,
    isActive: bootstrapped.is_active,
    firstName: user.firstName,
    lastName: user.lastName,
  };
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

export function canManageContent(role: CmsAdminRole) {
  return role === "owner" || role === "admin" || role === "editor";
}

export function canManageAdmins(role: CmsAdminRole) {
  return role === "owner";
}

export function canManageSettings(role: CmsAdminRole) {
  return role === "owner" || role === "admin";
}
