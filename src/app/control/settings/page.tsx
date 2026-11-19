import { requireControlContext } from "@/lib/control/access";

export default async function ControlSettingsPage() {
  const { role } = await requireControlContext();
  return (
    <>
      <div className="control-heading"><div><p className="control-kicker">SYSTEM / CONFIGURATION</p><h1>System settings</h1><p>Operational controls for the public website and admin workspace.</p></div></div>
      <section className="control-card">
        <div className="control-card-head"><div><h2 className="control-card-title">Environment status</h2><p className="control-card-subtitle">Read-only configuration summary</p></div></div>
        <div className="control-table-wrap"><table className="control-table"><tbody>
          <tr><th>Admin role</th><td><strong>{role}</strong></td></tr>
          <tr><th>CMS storage</th><td><span className="control-status">Supabase connected</span></td></tr>
          <tr><th>Authentication</th><td><span className="control-status">WorkOS AuthKit</span></td></tr>
          <tr><th>Public analytics</th><td><span className="control-status">Privacy-first page views</span></td></tr>
          <tr><th>Payment configuration</th><td>Managed separately from this CMS. No invoice or payment records are editable here.</td></tr>
        </tbody></table></div>
      </section>
      <div className="control-callout" style={{ marginTop: 14 }}>Feature flags, integration secrets, and billing controls are intentionally not exposed in this first release. Secrets remain in deployment environment variables, never in CMS content or browser-accessible settings.</div>
    </>
  );
}
