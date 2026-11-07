import Link from "next/link";
import { redirect } from "next/navigation";
import { getBusinessContext } from "@/lib/auth/business-context";
import { effectiveStatus, formatMoney } from "@/lib/invoices";
import { withTransitionDelay } from "@/lib/utils/timing";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 25;
  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login");
  if (!business) return <main className="dashboard-content"><h1>Business profile unavailable</h1><p>Apply the Supabase migration to finish setting up your business account.</p></main>;
  const { data: invoices, count, error } = await withTransitionDelay(
    supabase
      .from("invoices")
      .select("id,invoice_number,customer_name,amount_minor,currency,status,due_date,created_at", { count: "exact" })
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1),
    700
  );
  return <main className="dashboard-content">
    <header className="dashboard-heading"><div><p className="eyebrow">BUSINESS MANAGEMENT</p><h1>Invoices</h1><p>{count ?? 0} invoice{count === 1 ? "" : "s"} in your account.</p></div><Link className="button button-dark" href="/dashboard/invoices/new">Create invoice <span aria-hidden="true">↗</span></Link></header>
    {error ? <p className="inline-error">Invoices could not be loaded. Refresh the page to try again.</p> : invoices?.length ? <><div className="invoice-table-wrap"><table className="invoice-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Created</th><th>Due date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{invoices.map((invoice) => {
      const status = effectiveStatus(invoice);
      return <tr key={invoice.id}><td><Link href={`/dashboard/invoices/${invoice.id}`}>{invoice.invoice_number}</Link></td><td>{invoice.customer_name}</td><td>{new Date(`${invoice.created_at.slice(0, 10)}T00:00:00`).toLocaleDateString()}</td><td>{invoice.due_date ? new Date(`${invoice.due_date}T00:00:00`).toLocaleDateString() : "—"}</td><td>{formatMoney(invoice.amount_minor, invoice.currency)}</td><td><span className={`status status-${status}`}>{status}</span></td></tr>;
    })}</tbody></table></div><nav className="pagination" aria-label="Invoice pages"><span>Page {page} of {Math.max(1, Math.ceil((count ?? 0) / pageSize))}</span><div>{page > 1 && <Link href={`/dashboard/invoices?page=${page - 1}`}>← Newer</Link>}{page * pageSize < (count ?? 0) && <Link href={`/dashboard/invoices?page=${page + 1}`}>Older →</Link>}</div></nav></> : <div className="empty-state"><p>No invoices yet.</p><Link href="/dashboard/invoices/new">Create your first invoice →</Link></div>}
  </main>;
}
