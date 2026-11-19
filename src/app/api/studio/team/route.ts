import { NextRequest, NextResponse } from "next/server";
import { canManageAdmins, createCmsServiceClient, getCmsAdmin } from "@/lib/cms/admin";

export const dynamic = "force-dynamic";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function GET() {
  const admin = await getCmsAdmin();
  if (!admin) return new NextResponse(null, { status: 404 });
  if (!canManageAdmins(admin.role)) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const db = createCmsServiceClient();
  const { data, error } = await db.from("cms_admin_users")
    .select("id,supabase_user_id,email,display_name,role,is_active,created_at,last_seen_at")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "Could not load the admin team." }, { status: 500 });
  return NextResponse.json({ admins: data ?? [] });
}

export async function POST(request: NextRequest) {
  const admin = await getCmsAdmin();
  if (!admin) return new NextResponse(null, { status: 404 });
  if (!canManageAdmins(admin.role)) return NextResponse.json({ error: "Owner access required." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const supabaseUserId = typeof body.supabaseUserId === "string" ? body.supabaseUserId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 120) : null;
  const role = String(body.role ?? "editor");
  if (!isUuid(supabaseUserId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["admin","editor","analyst"].includes(role)) {
    return NextResponse.json({ error: "Enter a valid Supabase user UUID, email, and non-owner role." }, { status: 400 });
  }

  const db = createCmsServiceClient();
  const { data: authUser, error: authUserError } = await db.auth.admin.getUserById(supabaseUserId);
  if (authUserError || !authUser.user || !authUser.user.email_confirmed_at || authUser.user.email?.toLowerCase() !== email) {
    return NextResponse.json({ error: "The Supabase user ID and verified account email do not match." }, { status: 400 });
  }
  const { error } = await db.from("cms_admin_users").insert({
    supabase_user_id: supabaseUserId, email, display_name: displayName || null,
    role, is_active: true, invited_by: admin.supabaseUserId,
  });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "This Supabase user already has an admin record." : "Could not grant access." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const admin = await getCmsAdmin();
  if (!admin) return new NextResponse(null, { status: 404 });
  if (!canManageAdmins(admin.role)) return NextResponse.json({ error: "Owner access required." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  const role = String(body.role ?? "");
  const isActive = body.isActive === true;
  if (!id || !["owner","admin","editor","analyst"].includes(role) || typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "Invalid role or access status." }, { status: 400 });
  }

  const db = createCmsServiceClient();
  const { data: target } = await db.from("cms_admin_users").select("id,supabase_user_id,role,is_active").eq("id", id).maybeSingle();
  if (!target) return NextResponse.json({ error: "Admin record not found." }, { status: 404 });
  if (target.supabase_user_id === admin.supabaseUserId && (role !== "owner" || !isActive)) {
    return NextResponse.json({ error: "You cannot remove or demote your own owner account." }, { status: 400 });
  }
  if (target.role === "owner" && (role !== "owner" || !isActive)) {
    const { count } = await db.from("cms_admin_users").select("id", { count: "exact", head: true }).eq("role", "owner").eq("is_active", true);
    if ((count ?? 0) <= 1) return NextResponse.json({ error: "Nodus must always have at least one active owner." }, { status: 400 });
  }

  const { error } = await db.from("cms_admin_users").update({
    role, is_active: isActive, updated_by: admin.supabaseUserId, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return NextResponse.json({ error: "Could not update admin access." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
