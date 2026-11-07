import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CancelInvoiceForm from "@/components/cancel-invoice-form";
import InvoiceSharePanel from "@/components/invoice-share-panel";
import { getBusinessContext } from "@/lib/auth/business-context";
import { effectiveStatus, formatMoney } from "@/lib/invoices";

export default async function InvoiceDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cancelled?: string; error?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();
  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login");
  if (!business) notFound();
  const { data: invoice, error } = await supabase.from("invoices").select("*").eq("id", id).eq("business_id", business.id).maybeSingle();
  if (error || !invoice) notFound();
  const status = effectiveStatus(invoice);
  const shareState = !invoice.share_token_hash
    ? "none"
    : invoice.share_token_expires_at && new Date(invoice.share_token_expires_at).getTime() > Date.now()
      ? "active"
      : "expired";
  const canEdit = status === "draft" || status === "open" || status === "overdue";
  const canCancel = canEdit;
  return <main className="dashboard-content narrow-content">
    <Link className="back-link" href="/dashboard/invoices">← Back to invoices</Link>
    <header className="detail-heading"><div><p className="eyebrow">INVOICE · {invoice.invoice_number}</p><h1>{invoice.customer_name}</h1><span className={`status status-${status}`}>{status}</span></div><div className="detail-actions">{canEdit && <Link className="button button-outline" href={`/dashboard/invoices/${id}/edit`}>Edit invoice</Link>}</div></header>
    {query.cancelled && <p className="form-success" role="status">Invoice cancelled. It can no longer be payable.</p>}{query.error && <p className="form-error" role="alert">Invoice could not be cancelled.</p>}
    <section className="invoice-detail-sheet"><div className="detail-amount"><span>AMOUNT DUE</span><strong>{formatMoney(invoice.amount_minor, invoice.currency)}</strong></div><dl><div><dt>From</dt><dd>{business.business_name}</dd></div><div><dt>Customer</dt><dd>{invoice.customer_name}{invoice.customer_email && <span>{invoice.customer_email}</span>}</dd></div><div><dt>Description</dt><dd>{invoice.description}</dd></div><div><dt>Issue date</dt><dd>{new Date(`${invoice.issue_date}T00:00:00`).toLocaleDateString()}</dd></div><div><dt>Due date</dt><dd>{invoice.due_date ? new Date(`${invoice.due_date}T00:00:00`).toLocaleDateString() : "Not set"}</dd></div><div><dt>Created</dt><dd>{new Date(invoice.created_at).toLocaleString()}</dd></div><div><dt>Updated</dt><dd>{new Date(invoice.updated_at).toLocaleString()}</dd></div></dl></section>
    <InvoiceSharePanel invoiceId={id} shareState={shareState} expiresAt={invoice.share_token_expires_at} canShare={invoice.status !== "draft"} />
    {canCancel && <section className="cancel-panel"><div><h2>Cancel invoice</h2><p>Cancelled invoices cannot be reopened and will not be payable.</p></div><CancelInvoiceForm invoiceId={id} /></section>}
    {invoice.status === "paid" && <p className="form-help">Paid status is recorded only after verified settlement.</p>}
  </main>;
}
