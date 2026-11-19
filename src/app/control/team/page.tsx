import { notFound } from "next/navigation";
import { requireControlContext } from "@/lib/control/access";
import { addControlAdminAction, updateControlAdminAction } from "./actions";

export default async function ControlTeamPage({ searchParams }: { searchParams: Promise<{ added?: string; saved?: string; error?: string }> }) {
  const [context, query] = await Promise.all([requireControlContext(), searchParams]);
  if (context.role !== "owner") notFound();
  const db = context.supabase as any;
  const { data } = await db.from("cms_admin_users").select("id,workos_user_id,email,display_name,role,is_active,last_seen_at,created_at").order("created_at", { ascending: true });
  const admins = data ?? [];
  return (
    <>
      <div className="control-heading"><div><p className="control-kicker">GOVERNANCE / RBAC</p><h1>Access & roles</h1><p>Only owners can add people, change roles, or disable access.</p></div></div>
      {query.added && <div className="control-callout" style={{ marginBottom: 14 }}>Admin access added.</div>}
      {query.saved && <div className="control-callout" style={{ marginBottom: 14 }}>Access settings updated.</div>}
      {query.error && <div className="control-callout" style={{ marginBottom: 14 }}>The request could not be completed. Check the WorkOS user ID, role, and whether you are editing your own account.</div>}
      <section className="control-card">
        <div className="control-card-head"><div><h2 className="control-card-title">Add an existing WorkOS user</h2><p className="control-card-subtitle">The person must already have a Nodus WorkOS account. This does not create or invite their identity.</p></div></div>
        <form action={addControlAdminAction} className="control-form">
          <div className="control-field"><label htmlFor="workos_user_id">WorkOS user ID</label><input id="workos_user_id" name="workos_user_id" required placeholder="user_..." /></div>
          <div className="control-field"><label htmlFor="email">Account email</label><input id="email" name="email" type="email" required /></div>
          <div className="control-field"><label htmlFor="display_name">Display name</label><input id="display_name" name="display_name" /></div>
          <div className="control-field"><label htmlFor="role">Role</label><select id="role" name="role" defaultValue="editor"><option value="admin">Admin</option><option value="editor">Editor</option><option value="analyst">Analyst</option></select></div>
          <div className="control-form-actions"><button className="control-button" type="submit">Grant access</button></div>
        </form>
      </section>
      <section className="control-card" style={{ marginTop: 16 }}>
        <div className="control-card-head"><div><h2 className="control-card-title">Control team</h2><p className="control-card-subtitle">{admins.length} authorized identities</p></div></div>
        <div className="control-table-wrap"><table className="control-table"><thead><tr><th>Person</th><th>WorkOS ID</th><th>Role</th><th>Access</th><th>Update</th></tr></thead>
          <tbody>{admins.map((admin: any) => <tr key={admin.id}><td><strong>{admin.display_name || admin.email}</strong><div style={{ color: "#9aa1a9", marginTop: 4 }}>{admin.email}</div></td><td>{admin.workos_user_id}</td><td>{admin.role}</td><td><span className="control-status">{admin.is_active ? "active" : "disabled"}</span></td><td><form action={updateControlAdminAction} style={{ display: "flex", gap: 5, alignItems: "center" }}><input type="hidden" name="id" value={admin.id} /><select name="role" defaultValue={admin.role} aria-label={`Role for ${admin.email}`} style={{ maxWidth: 100, minHeight: 30, border: "1px solid #e1e5e8", borderRadius: 4, fontSize: 10 }}><option value="owner">Owner</option><option value="admin">Admin</option><option value="editor">Editor</option><option value="analyst">Analyst</option></select><select name="is_active" defaultValue={String(admin.is_active)} aria-label={`Access status for ${admin.email}`} style={{ maxWidth: 95, minHeight: 30, border: "1px solid #e1e5e8", borderRadius: 4, fontSize: 10 }}><option value="true">Active</option><option value="false">Disabled</option></select><button className="control-button control-button-secondary" type="submit" style={{ minHeight: 30, padding: "0 8px" }}>Save</button></form></td></tr>)}</tbody>
        </table></div>
      </section>
      <div className="control-callout" style={{ marginTop: 14 }}>Roles: Owner manages admins and all settings. Admin manages CMS content and reviews operations. Editor creates and publishes content. Analyst has read-only access to analytics and activity.</div>
    </>
  );
}
