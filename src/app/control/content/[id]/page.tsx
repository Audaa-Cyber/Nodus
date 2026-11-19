import Link from "next/link";
import { notFound } from "next/navigation";
import { requireControlContext, canEditContent } from "@/lib/control/access";
import { archiveContentAction, publishContentAction, saveContentAction } from "../actions";

export default async function EditContentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; created?: string; published?: string; error?: string }> }) {
  const [{ id }, query, context] = await Promise.all([params, searchParams, requireControlContext()]);
  const db = context.supabase as any;
  const { data } = await db.from("cms_content").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const editable = canEditContent(context.role);
  return (
    <>
      <div className="control-heading"><div><p className="control-kicker">CONTENT / EDIT ENTRY</p><h1>{data.title}</h1><p>/{data.slug} · {data.status}</p></div><Link className="control-button control-button-secondary" href="/control/content">Back to library</Link></div>
      {query.saved && <div className="control-callout" style={{ marginBottom: 14 }}>Changes saved. A previous version has been retained in content history.</div>}
      {query.published && <div className="control-callout" style={{ marginBottom: 14 }}>Content marked as published.</div>}
      {query.error && <div className="control-callout" style={{ marginBottom: 14 }}>The requested action could not be completed. Check the fields and permissions, then try again.</div>}
      <section className="control-card">
        <form action={saveContentAction} className="control-form">
          <input type="hidden" name="id" value={data.id} />
          <div className="control-field"><label htmlFor="content_type">Content type</label><select id="content_type" name="content_type" defaultValue={data.content_type} disabled={!editable}><option value="homepage">Homepage</option><option value="feature">Feature</option><option value="faq">FAQ</option><option value="announcement">Announcement</option><option value="changelog">Changelog</option><option value="privacy">Privacy policy</option><option value="terms">Terms</option><option value="page">Page</option></select></div>
          <div className="control-field"><label htmlFor="title">Title</label><input id="title" name="title" required defaultValue={data.title} readOnly={!editable} /></div>
          <div className="control-field"><label htmlFor="slug">Slug</label><input id="slug" name="slug" required defaultValue={data.slug} readOnly={!editable} /></div>
          <div className="control-field"><label htmlFor="excerpt">Short description</label><textarea id="excerpt" name="excerpt" rows={2} defaultValue={data.excerpt ?? ""} readOnly={!editable} /></div>
          <div className="control-field"><label htmlFor="body">Content body · JSON</label><textarea id="body" name="body" defaultValue={JSON.stringify(data.body ?? {}, null, 2)} readOnly={!editable} /></div>
          <div className="control-field"><label htmlFor="seo_title">SEO title</label><input id="seo_title" name="seo_title" defaultValue={data.seo_title ?? ""} readOnly={!editable} /></div>
          <div className="control-field"><label htmlFor="seo_description">SEO description</label><textarea id="seo_description" name="seo_description" rows={2} defaultValue={data.seo_description ?? ""} readOnly={!editable} /></div>
          <div className="control-field"><label htmlFor="social_image_url">Social preview image URL</label><input id="social_image_url" name="social_image_url" defaultValue={data.social_image_url ?? ""} readOnly={!editable} /></div>
          {editable && <div className="control-form-actions"><button className="control-button" type="submit">Save changes</button></div>}
        </form>
      </section>
      {editable && <div style={{ display: "flex", gap: 9, marginTop: 14, flexWrap: "wrap" }}>
        <form action={publishContentAction}><input type="hidden" name="id" value={data.id} /><button className="control-button" type="submit">Publish</button></form>
        <form action={archiveContentAction}><input type="hidden" name="id" value={data.id} /><button className="control-button control-button-secondary" type="submit">Archive</button></form>
      </div>}
      <section className="control-card" style={{ marginTop: 18 }}>
        <div className="control-card-head"><div><h2 className="control-card-title">Content history</h2><p className="control-card-subtitle">Immutable snapshots captured before each edit</p></div></div>
        <div className="control-table-wrap">
          {/** Revisions are loaded independently so a missing history never blocks editing. */}
          <RevisionHistory supabase={context.supabase} contentId={id} />
        </div>
      </section>
    </>
  );
}

async function RevisionHistory({ supabase, contentId }: { supabase: any; contentId: string }) {
  const { data } = await supabase.from("cms_content_revisions").select("id,changed_by,change_note,created_at").eq("content_id", contentId).order("created_at", { ascending: false }).limit(20);
  if (!data?.length) return <div className="control-empty">No previous versions yet. The first snapshot is created when this content is edited.</div>;
  return <table className="control-table"><thead><tr><th>Saved</th><th>Changed by</th><th>Note</th></tr></thead><tbody>{data.map((item: any) => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString()}</td><td>{item.changed_by ?? "System"}</td><td>{item.change_note ?? "Previous version"}</td></tr>)}</tbody></table>;
}
