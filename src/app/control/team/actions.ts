"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireControlContext } from "@/lib/control/access";

export async function addControlAdminAction(formData: FormData) {
  const context = await requireControlContext();
  if (context.role !== "owner") redirect("/control/team?error=permission");
  const workosUserId = String(formData.get("workos_user_id") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = String(formData.get("role") ?? "editor");
  if (!workosUserId.startsWith("user_") || !email.includes("@") || !["admin","editor","analyst"].includes(role)) {
    redirect("/control/team?error=invalid");
  }
  const db = context.supabase as any;
  const { error } = await db.from("cms_admin_users").insert({
    workos_user_id: workosUserId, email, display_name: displayName || null,
    role, is_active: true, invited_by: context.user.id,
  });
  if (error) redirect("/control/team?error=save");
  revalidatePath("/control/team");
  redirect("/control/team?added=1");
}

export async function updateControlAdminAction(formData: FormData) {
  const context = await requireControlContext();
  if (context.role !== "owner") redirect("/control/team?error=permission");
  const id = String(formData.get("id") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const isActive = String(formData.get("is_active") ?? "false") === "true";
  const db = context.supabase as any;
  const { data: target } = await db.from("cms_admin_users").select("workos_user_id").eq("id", id).maybeSingle();
  if (!target || target.workos_user_id === context.user.id && !isActive) redirect("/control/team?error=self");
  if (!["owner","admin","editor","analyst"].includes(role)) redirect("/control/team?error=invalid");
  const { error } = await db.from("cms_admin_users").update({ role, is_active: isActive, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) redirect("/control/team?error=save");
  revalidatePath("/control/team");
  revalidatePath("/control");
  redirect("/control/team?saved=1");
}
