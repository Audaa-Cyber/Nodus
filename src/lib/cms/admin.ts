import "server-only";

import { notFound } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/business-context";
import { requireServerSupabaseEnv } from "@/config/env.server";
import { createClient } from "@supabase/supabase-js";

export type CmsAdminRole = "owner" | "admin" | "editor" | "analyst";
export type CmsAdmin = {
  id: string;
  workosUserId: string;
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
  const db = createCmsServiceClient();
  const { data: existing, error } = await db
    .from("cms_admin_users")
    .select("id,workos_user_id,email,display_name,role,is_active")
    .eq("workos_user_id", user.id)
    .maybeSingle();

  if (error) return null;
  if (existing) {
    if (!existing.is_active) return null;
    return {
      id: existing.id,
      workosUserId: existing.workos_user_id,
      email: existing.email,
      displayName: existing.display_name,
      role: existing.role as CmsAdminRole,
      isActive: existing.is_active,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  const bootstrapSubjects = (process.env.CMS_ADMIN_WORKOS_SUBJECTS ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const bootstrapEmails = (process.env.CMS_ADMIN_EMAILS ?? "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const normalizedEmail = user.email?.trim().toLowerCase() ?? "";
  if (!bootstrapSubjects.includes(user.id) && (!normalizedEmail || !bootstrapEmails.includes(normalizedEmail))) return null;

  const { count, error: countError } = await db
    .from("cms_admin_users")
    .select("id", { count: "exact", head: true });
  if (countError || (count ?? 0) > 0) return null;

  const email = user.email ?? "";
  if (!email) return null;
  const { data: created, error: createError } = await db
    .from("cms_admin_users")
    .insert({
      workos_user_id: user.id,
      email,
      display_name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
      role: "owner",
      is_active: true,
    })
    .select("id,workos_user_id,email,display_name,role,is_active")
    .single();

  if (createError || !created) return null;
  return {
    id: created.id,
    workosUserId: created.workos_user_id,
    email: created.email,
    displayName: created.display_name,
    role: created.role as CmsAdminRole,
    isActive: created.is_active,
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
