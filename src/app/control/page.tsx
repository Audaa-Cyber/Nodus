import Link from "next/link";
import { ArrowUpRight, FilePlus2, ExternalLink } from "lucide-react";
import { requireControlContext } from "@/lib/control/access";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function relativeTime(value: string) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function ControlOverviewPage() {
  const { supabase } = await requireControlContext();
  const db = supabase as any;
  const now = new Date();
  const currentStart = new Date(now.getTime() - 7 * 86400000);
  const previousStart = new Date(now.getTime() - 14 * 86400000);

  const [eventsResult, contentResult, businessResult, invoiceResult, activityResult] = await Promise.all([
    db.from("cms_analytics_events").select("session_id,created_at").eq("event_name", "page_view").gte("created_at", previousStart.toISOString()).limit(5000),
    db.from("cms_content").select("id,status,content_type,updated_at").limit(1000),
    db.from("business_profiles").select("id", { count: "exact", head: true }),
    db.from("invoices").select("id", { count: "exact", head: true }),
    db.from("cms_audit_logs").select("id,action,summary,created_at,actor_email").order("created_at", { ascending: false }).limit(6),
  ]);

  const events = eventsResult.data ?? [];
  const currentEvents = events.filter((event: any) => new Date(event.created_at) >= currentStart);
  const previousEvents = events.filter((event: any) => new Date(event.created_at) < currentStart);
  const currentSessions = new Set(currentEvents.map((event: any) => event.session_id)).size;
  const previousSessions = new Set(previousEvents.map((event: any) => event.session_id)).size;
  const content = contentResult.data ?? [];
  const published = content.filter((item: any) => item.status === "published").length;
  const drafts = content.filter((item: any) => item.status === "draft").length;
  const delta = currentEvents.length - previousEvents.length;
  const deltaLabel = previousEvents.length === 0 ? "No previous-week baseline" : `${delta >= 0 ? "+" : ""}${Math.round((delta / previousEvents.length) * 100)}% vs previous 7 days`;

  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(currentStart.getTime() + index * 86400000);
    const next = new Date(date.getTime() + 86400000);
    const count = currentEvents.filter((event: any) => {
      const created = new Date(event.created_at);
      return created >= date && created < next;
    }).length;
    return { label: date.toLocaleDateString("en-US", { weekday: "short" }), count };
  });
  const maxDaily = Math.max(1, ...daily.map((day) => day.count));

  return (
    <>
      <div className="control-heading">
        <div>
          <p className="control-kicker">OVERVIEW / LAST 7 DAYS</p>
          <h1>Good morning.</h1>
          <p>Your public website and Nodus operations, at a glance.</p>
        </div>
        <Link className="control-button" href="/control/content/new"><FilePlus2 size={14} /> Create content</Link>
      </div>

      <section className="control-kpi-grid" aria-label="Key performance indicators">
        <article className="control-card control-kpi">
          <div className="control-kpi-label">Website page views</div>
          <div className="control-kpi-value">{formatNumber(currentEvents.length)}</div>
          <div className="control-kpi-foot"><span className="control-kpi-trend">{deltaLabel}</span></div>
        </article>
        <article className="control-card control-kpi">
          <div className="control-kpi-label">Unique sessions</div>
          <div className="control-kpi-value">{formatNumber(currentSessions)}</div>
          <div className="control-kpi-foot"><span className="control-kpi-trend">{previousSessions ? `${currentSessions - previousSessions >= 0 ? "+" : ""}${currentSessions - previousSessions} sessions` : "Baseline collecting"}</span><span>vs previous week</span></div>
        </article>
        <article className="control-card control-kpi">
          <div className="control-kpi-label">Published content</div>
          <div className="control-kpi-value">{formatNumber(published)}</div>
          <div className="control-kpi-foot"><span>{formatNumber(drafts)} drafts waiting</span></div>
        </article>
        <article className="control-card control-kpi">
          <div className="control-kpi-label">Merchant workspaces</div>
          <div className="control-kpi-value">{formatNumber(businessResult.count ?? 0)}</div>
          <div className="control-kpi-foot"><span>All-time accounts</span></div>
        </article>
      </section>

      <section className="control-grid-two">
        <article className="control-card">
          <div className="control-card-head">
            <div><h2 className="control-card-title">Website traffic</h2><p className="control-card-subtitle">Daily page views · last 7 days</p></div>
            <span className="control-status">LIVE DATA</span>
          </div>
          <div className="control-chart">
            <div className="control-chart-bars">
              {daily.map((day) => (
                <div className="control-chart-bar-wrap" key={day.label} title={`${day.count} views`}>
                  <span className="control-chart-bar" style={{ height: `${Math.max(2, (day.count / maxDaily) * 100)}%` }} />
                </div>
              ))}
            </div>
            <div className="control-chart-labels">{daily.map((day) => <span key={day.label}>{day.label}</span>)}</div>
          </div>
        </article>
        <article className="control-card">
          <div className="control-card-head">
            <div><h2 className="control-card-title">Content workspace</h2><p className="control-card-subtitle">Publishing status</p></div>
            <Link href="/control/content" aria-label="Open content"><ArrowUpRight size={15} /></Link>
          </div>
          <div className="control-activity">
            {(["homepage", "feature", "faq", "announcement", "changelog", "privacy", "terms"] as const).map((type) => {
              const count = content.filter((item: any) => item.content_type === type).length;
              return <div className="control-activity-row" key={type}><span className="control-activity-dot" /><div className="control-activity-copy"><strong>{type[0].toUpperCase() + type.slice(1)}</strong><span className="control-activity-time">{count} entries</span></div></div>;
            })}
          </div>
        </article>
      </section>

      <section className="control-card">
        <div className="control-card-head">
          <div><h2 className="control-card-title">Recent activity</h2><p className="control-card-subtitle">Changes made inside Nodus Control</p></div>
          <Link className="control-button control-button-secondary" href="/control/activity">View audit log <ArrowUpRight size={13} /></Link>
        </div>
        <div className="control-activity">
          {(activityResult.data ?? []).length === 0 ? (
            <div className="control-empty">No admin activity yet. Content edits and access changes will appear here.</div>
          ) : (activityResult.data ?? []).map((item: any) => (
            <div className="control-activity-row" key={item.id}>
              <span className="control-activity-dot" />
              <div className="control-activity-copy"><strong>{item.summary}</strong><span className="control-activity-time">{item.actor_email ?? "Control admin"} · {relativeTime(item.created_at)}</span></div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginTop: 18, color: "#969da5", fontSize: 9 }}>
        <span>Product invoices tracked: {formatNumber(invoiceResult.count ?? 0)} total</span>
        <Link href="/" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Open public website <ExternalLink size={11} /></Link>
      </div>
    </>
  );
}
