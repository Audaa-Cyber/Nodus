import { NextRequest, NextResponse } from "next/server";
import { canManageSettings, createCmsServiceClient, getCmsAdmin } from "@/lib/cms/admin";

export const dynamic = "force-dynamic";

const allowedKeys = new Set([
  "public_site.announcement_banner",
  "features.faq_enabled",
  "features.changelog_enabled",
  "seo.default_title",
  "seo.default_description",
  "seo.default_social_image",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validSetting(key: string, value: unknown): boolean {
  if (key === "public_site.announcement_banner") {
    return isRecord(value)
      && typeof value.enabled === "boolean"
      && typeof value.text === "string"
      && value.text.length <= 240;
  }
  if (key === "features.faq_enabled" || key === "features.changelog_enabled") {
    return isRecord(value) && typeof value.enabled === "boolean";
  }
  if (key === "seo.default_title") {
    return typeof value === "string" && value.trim().length > 0 && value.length <= 70;
  }
  if (key === "seo.default_description") {
    return typeof value === "string" && value.trim().length > 0 && value.length <= 180;
  }
  if (key === "seo.default_social_image") {
    if (value === "") return true;
    if (typeof value !== "string" || value.length > 2048) return false;
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  }
  return false;
}

export async function GET() {
  const admin = await getCmsAdmin();
  if (!admin) return new NextResponse(null, { status: 404 });
  if (!canManageSettings(admin.role)) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const db = createCmsServiceClient();
  const { data, error } = await db.from("cms_settings").select("key,value,description,updated_at,updated_by").order("key");
  if (error) return NextResponse.json({ error: "Settings could not be loaded." }, { status: 500 });
  return NextResponse.json({ settings: data ?? [] });
}

export async function PUT(request: NextRequest) {
  const admin = await getCmsAdmin();
  if (!admin) return new NextResponse(null, { status: 404 });
  if (!canManageSettings(admin.role)) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const key = String(body.key ?? "");
  const description = typeof body.description === "string" ? body.description.slice(0, 240) : null;
  if (!allowedKeys.has(key) || body.value === undefined) return NextResponse.json({ error: "This setting is not editable here." }, { status: 400 });
  if (!validSetting(key, body.value)) return NextResponse.json({ error: "The value does not match this setting's required format." }, { status: 400 });
  const serialized = JSON.stringify(body.value);
  if (serialized.length > 8000) return NextResponse.json({ error: "Setting value is too large." }, { status: 400 });

  const db = createCmsServiceClient();
  const timestamp = new Date().toISOString();
  const { error } = await db.from("cms_settings").upsert({
    key, value: body.value, description, updated_by: admin.workosUserId, updated_at: timestamp,
  }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "Could not save this setting." }, { status: 400 });
  const { error: auditError } = await db.from("cms_audit_logs").insert({
    actor_user_id: admin.workosUserId, actor_email: admin.email,
    action: "setting.updated", resource_type: "cms_setting", resource_id: key,
    summary: "Updated system setting: " + key, metadata: { key },
  });
  if (auditError) return NextResponse.json({ error: "The setting was saved, but its audit event could not be recorded." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
