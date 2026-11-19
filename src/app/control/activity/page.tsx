import { requireControlContext } from "@/lib/control/access";

export default async function ControlActivityPage() {
  const { supabase } = await requireControlContext();
  const db = supabase as any;
  const { data } = await db.from("cms_audit_logs").select("id,actor_user_id,actor_email,action,resource_type,resource_id,summary,metadata,created_at").order("created_at", { ascending: false }).limit(100);
  const rows = data ?? [];
  return (
    <>
      <div className="control-heading"><div><p className="control-kicker">GOVERNANCE / AUDIT TRAIL</p><h1>Audit activity</h1><p>Append-only record of content and access changes made inside Control.</p></div></div>
      <section className="control-card"><div className="control-card-head"><div><h2 className="control-card-title">Latest events</h2><p className="control-card-subtitle">Showing up to 100 recent events</p></div></div>
        <div className="control-table-wrap"><table className="control-table"><thead><tr><th>Event</th><th>Actor</th><th>Resource</th><th>Time</th></tr></thead><tbody>
          {rows.map((row: any) => <tr key={row.id}><td><strong>{row.summary}</strong><div style={{ color: "#9aa1a9", marginTop: 4 }}>{row.action}</div></td><td>{row.actor_email ?? row.actor_user_id ?? "System"}</td><td>{row.resource_type}</td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}
        </tbody></table>{rows.length === 0 && <div className="control-empty">No audit events yet.</div>}</div>
      </section>
    </>
  );
}
