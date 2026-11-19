import { NextRequest, NextResponse } from "next/server";
import { getCmsAdmin, createCmsServiceClient } from "@/lib/cms/admin";

export const dynamic = "force-dynamic";

const kinds = new Set(["homepage", "feature", "faq", "announcement", "changelog", "legal"]);
const statuses = new Set(["draft", "published", "archived"]);

export async function GET() {
  const admin = await getCmsAdmin();
  if (!admin) return new NextResponse(null, { status: 404 });

  const db = createCmsServiceClient();
  const [documents, revisions] = await Promise.all([
    db.from("cms_documents").select("*").order("updated_at", { ascending: false }),
    db.from("cms_revisions").select("id,document_id,version,title,status,changed_by,change_note,created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  if (documents.error || revisions.error) {
    return NextResponse.json({ error: "CMS data could not be loaded." }, { status: 500 });
  }
  return NextResponse.json({ documents: documents.data ?? [], revisions: revisions.data ?? [] });
}

export async function POST(request: NextRequest) {
  const admin = await getCmsAdmin();
  if (!admin) return new NextResponse(null, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const kind = String(body.kind ?? "");
  const slug = String(body.slug ?? "").trim().toLowerCase();
  const title = String(body.title ?? "").trim();
  const status = String(body.status ?? "draft");
  const content = body.content && typeof body.content === "object" && !Array.isArray(body.content) ? body.content : {};
  const seo = body.seo && typeof body.seo === "object" && !Array.isArray(body.seo) ? body.seo : {};
  const id = typeof body.id === "string" ? body.id : null;
  const changeNote = typeof body.changeNote === "string" ? body.changeNote.slice(0, 240) : null;

  if (!kinds.has(kind) || !statuses.has(status) || !/^[a-z0-9][a-z0-9/_-]{0,119}$/.test(slug) || !title || title.length > 180) {
    return NextResponse.json({ error: "Check the content type, slug, title, and status." }, { status: 400 });
  }

  const db = createCmsServiceClient();
  const timestamp = new Date().toISOString();
  let documentId = id;
  let version = 1;

  if (id) {
    const current = await db.from("cms_documents").select("id").eq("id", id).maybeSingle();
    if (current.error || !current.data) return NextResponse.json({ error: "Content entry not found." }, { status: 404 });
    const count = await db.from("cms_revisions").select("version").eq("document_id", id).order("version", { ascending: false }).limit(1).maybeSingle();
    version = (count.data?.version ?? 0) + 1;
    const update = await db.from("cms_documents").update({
      kind, slug, title, status, content, seo,
      published_at: status === "published" ? timestamp : null,
      updated_by: admin.id, updated_at: timestamp,
    }).eq("id", id);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 400 });
  } else {
    const insert = await db.from("cms_documents").insert({
      kind, slug, title, status, content, seo,
      published_at: status === "published" ? timestamp : null,
      created_by: admin.id, updated_by: admin.id,
    }).select("id").single();
    if (insert.error || !insert.data) return NextResponse.json({ error: insert.error?.message ?? "Could not create entry." }, { status: 400 });
    documentId = insert.data.id;
  }

  const revision = await db.from("cms_revisions").insert({
    document_id: documentId, version, title, status, content, seo,
    changed_by: admin.id, change_note: changeNote,
  });
  if (revision.error) return NextResponse.json({ error: "Entry saved, but its revision snapshot failed. Contact support." }, { status: 500 });

  return NextResponse.json({ ok: true, id: documentId, version });
}

export async function DELETE(request: NextRequest) {
  const admin = await getCmsAdmin();
  if (!admin) return new NextResponse(null, { status: 404 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing content ID." }, { status: 400 });
  const db = createCmsServiceClient();
  const result = await db.from("cms_documents").update({ status: "archived", updated_by: admin.id, updated_at: new Date().toISOString() }).eq("id", id);
  if (result.error) return NextResponse.json({ error: "Could not archive this entry." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
