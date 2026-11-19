import Link from "next/link";
import { FilePlus2, ArrowUpRight } from "lucide-react";
import { requireControlContext, canEditContent } from "@/lib/control/access";

export default async function ContentListPage() {
  const { supabase, role } = await requireControlContext();
  const db = supabase as any;
  const { data } = await db.from("cms_content").select("id,content_type,slug,title,status,updated_at,seo_title").order("updated_at", { ascending: false }).limit(100);
  const items = data ?? [];
  return (
    <>
      <div className="control-heading">
        <div><p className="control-kicker">PUBLISHING / CONTENT LIBRARY</p><h1>Website content</h1><p>Manage the copy and metadata that appear on the public Nodus website.</p></div>
        {canEditContent(role) && <Link className="control-button" href="/control/content/new"><FilePlus2 size={14} /> New content</Link>}
      </div>
      <section className="control-card">
        <div className="control-card-head"><div><h2 className="control-card-title">All content</h2><p className="control-card-subtitle">{items.length} most recently updated entries</p></div></div>
        <div className="control-table-wrap">
          <table className="control-table">
            <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Last updated</th><th /></tr></thead>
            <tbody>
              {items.map((item: any) => <tr key={item.id}>
                <td><strong>{item.title}</strong><div style={{ color: "#9aa1a9", marginTop: 4 }}>/ {item.slug}</div></td>
                <td>{item.content_type}</td>
                <td><span className="control-status">{item.status}</span></td>
                <td>{new Date(item.updated_at).toLocaleDateString()}</td>
                <td><Link href={`/control/content/${item.id}`} aria-label={`Edit ${item.title}`}><ArrowUpRight size={15} /></Link></td>
              </tr>)}
            </tbody>
          </table>
          {items.length === 0 && <div className="control-empty">No content entries yet. Create your first draft to start building the public website library.</div>}
        </div>
      </section>
      <div className="control-callout" style={{ marginTop: 14 }}>Publishing stores a versioned content record. Homepage rendering is still using the existing hand-authored layout until each public section is connected to its CMS content key.</div>
    </>
  );
}
