import "server-only";

import { withAuth } from "@workos-inc/authkit-nextjs";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ControlRole = "owner" | "admin" | "editor" | "analyst";

export type ControlContext = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  user: { id: string; email: string; firstName?: string | null; lastName?: string | null };
  role: ControlRole;
};

export async function getControlContext(): Promise<ControlContext | null> {
  const { user, accessToken } = await withAuth();
  if (!user || !accessToken) return null;

  const supabase = await createSupabaseServerClient(accessToken);
  const db = supabase as any;
  const { data, error } = await db
    .from("cms_admin_users")
    .select("role,is_active")
    .eq("workos_user_id", user.id)
    .maybeSingle();

  if (error || !data?.is_active) return null;
  return {
    supabase,
    user: {
      id: user.id,
      email: user.email ?? "",
      firstName: user.firstName,
      lastName: user.lastName,
    },
    role: data.role as ControlRole,
  };
}

/** Hide the private console from non-admins, including unauthenticated visitors. */
export async function requireControlContext(): Promise<ControlContext> {
  const context = await getControlContext();
  if (!context) notFound();
  return context;
}

export function canEditContent(role: ControlRole) {
  return role === "owner" || role === "admin" || role === "editor";
}

export function canManageAdmins(role: ControlRole) {
  return role === "owner";
}
