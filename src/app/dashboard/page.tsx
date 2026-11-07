import Link from "next/link";
import { redirect } from "next/navigation";
import { getBusinessContext } from "@/lib/auth/business-context";
import { effectiveStatus, formatMoney } from "@/lib/invoices";

export default async function DashboardPage() {
  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login");
  if (!business) return <main className="dashboard-content"><h1>Business profile unavailable</h1><p>Apply the Supabase migration to finish setting up your business account.</p></main>;
  const today = new Date().toISOString().slice(0, 10);
  const [total, open, paid, overdue, recent] = await Promise.all([
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("business_id", business.id),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("status", "open").or(`due_date.is.null,due_date.gte.${today}`),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("status", "paid"),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("business_id", business.id).or(`status.eq.overdue,and(status.eq.open,due_date.lt.${today})`),
    supabase.from("invoices").select("id,invoice_number,customer_name,amount_minor,currency,status,due_date,issue_date,created_at").eq("business_id", business.id).order("created_at", { ascending: false }).limit(6),
  ]);
  const statError = total.error || open.error || paid.error || overdue.error;
  const stats = [ ["Total invoices", total.count], ["Open invoices", open.count], ["Paid invoices", paid.count], ["Overdue invoices", overdue.count] ] as const;
  return <main className="dashboard-content">
    <header className="dashboard-heading"><div><p className="eyebrow">BUSINESS OVERVIEW</p><h1>{business.business_name}</h1><p>Keep your invoices and their status in one place.</p></div><Link className="button button-dark" href="/dashboard/invoices/new">Create invoice <span aria-hidden="true">↗</span></Link></header>
    {statError ? <p className="inline-error" role="alert">Invoice summary could not be loaded. Refresh the page to try again.</p> : <section className="stat-grid" aria-label="Invoice summary">{stats.map(([label, value]) => <div className="stat-item" key={label}><span>{label}</span><strong>{value ?? 0}</strong></div>)}</section>}
    <section className="recent-section"><div className="section-heading"><div><p className="eyebrow">LATEST ACTIVITY</p><h2>Recent invoices</h2></div><Link href="/dashboard/invoices">All invoices <span aria-hidden="true">→</span></Link></div>
      {recent.error ? <p className="inline-error">Invoices could not be loaded.</p> : recent.data?.length ? <div className="invoice-table-wrap"><table className="invoice-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Issue date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{recent.data.map((invoice) => {
        const status = effectiveStatus(invoice);
        return <tr key={invoice.id}><td><Link href={`/dashboard/invoices/${invoice.id}`}>{invoice.invoice_number}</Link></td><td>{invoice.customer_name}</td><td>{new Date(`${invoice.issue_date}T00:00:00`).toLocaleDateString()}</td><td>{formatMoney(invoice.amount_minor, invoice.currency)}</td><td><span className={`status status-${status}`}>{status}</span></td></tr>;
      })}</tbody></table></div> : <div className="empty-state"><p>No invoices yet.</p><Link href="/dashboard/invoices/new">Create your first invoice →</Link></div>}
    </section>
  </main>;
}
