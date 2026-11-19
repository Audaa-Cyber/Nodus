import { NextResponse } from "next/server";
import { createCmsServiceClient, getCmsAdmin } from "@/lib/cms/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCmsAdmin();
  if (!admin) return new NextResponse(null, { status: 404 });
  const db = createCmsServiceClient();
  const { data, error } = await db.from("cms_audit_logs")
    .select("id,actor_user_id,actor_email,action,resource_type,resource_id,summary,metadata,created_at")
    .order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: "Audit history could not be loaded." }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
