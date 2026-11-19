import "server-only";

import { withAuth } from "@workos-inc/authkit-nextjs";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCmsServiceClient } from "@/lib/cms/admin";

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
  const email = (user.email ?? "").trim().toLowerCase();
  const bootstrapEmails = (process.env.CMS_ADMIN_EMAILS ?? "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);

  // One-time owner bootstrap. An email must be explicitly allowlisted in the server environment.
  if (email && bootstrapEmails.includes(email)) {
    const service = createCmsServiceClient();
    const existing = await service.from("cms_admin_users")
      .select("id,is_active").eq("workos_user_id", user.id).maybeSingle();
    if (!existing.data) {
      await service.from("cms_admin_users").insert({
        workos_user_id: user.id,
        email,
        display_name: [user.firstName, user.lastName].filter(Boolean).join(" ") || email,
        role: "owner",
        is_active: true,
      });
    }
  }

  const { data, error } = await (supabase as any)
    .from("cms_admin_users")
    .select("role,is_active")
    .eq("workos_user_id", user.id)
    .maybeSingle();

  if (error || !data?.is_active) return null;
  return {
    supabase,
    user: {
      id: user.id,
      email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    role: data.role as ControlRole,
  };
}

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
