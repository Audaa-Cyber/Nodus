import { NextRequest, NextResponse } from "next/server";
import { getCmsAdmin, createCmsServiceClient, canManageContent } from "@/lib/cms/admin";

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
  if (!canManageContent(admin.role)) return NextResponse.json({ error: "Your role is read-only." }, { status: 403 });

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
  const { data, error } = await db.rpc("nodus_cms_save_document", {
    p_document_id: id,
    p_kind: kind,
    p_slug: slug,
    p_title: title,
    p_status: status,
    p_content: content,
    p_seo: seo,
    p_actor: admin.workosUserId,
    p_change_note: changeNote,
  });

  if (error) {
    const statusCode = error.code === "P0002" ? 404 : error.code === "23505" ? 409 : error.code === "42501" ? 403 : 400;
    const message = error.code === "23505"
      ? "That URL slug is already in use."
      : error.code === "P0002"
        ? "Content entry not found."
        : error.code === "42501"
          ? "Your role is not allowed to edit content."
          : "Could not save this content entry.";
    return NextResponse.json({ error: message }, { status: statusCode });
  }

  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved?.document_id || typeof saved.version !== "number") {
    return NextResponse.json({ error: "The CMS did not confirm the saved revision." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: saved.document_id, version: saved.version });
}

export async function DELETE(request: NextRequest) {
  const admin = await getCmsAdmin();
  if (!admin) return new NextResponse(null, { status: 404 });
  if (!canManageContent(admin.role)) return NextResponse.json({ error: "Your role is read-only." }, { status: 403 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing content ID." }, { status: 400 });
  const db = createCmsServiceClient();
  const { data: document, error: readError } = await db.from("cms_documents")
    .select("id,kind,slug,title,content,seo")
    .eq("id", id)
    .maybeSingle();
  if (readError || !document) return NextResponse.json({ error: "Content entry not found." }, { status: 404 });

  const { error } = await db.rpc("nodus_cms_save_document", {
    p_document_id: document.id,
    p_kind: document.kind,
    p_slug: document.slug,
    p_title: document.title,
    p_status: "archived",
    p_content: document.content,
    p_seo: document.seo,
    p_actor: admin.workosUserId,
    p_change_note: "Archived from Nodus Studio",
  });
  if (error) return NextResponse.json({ error: "Could not archive this entry." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
