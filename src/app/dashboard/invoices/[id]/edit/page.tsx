import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import InvoiceForm from "@/components/invoice-form";
import { getBusinessContext } from "@/lib/auth/business-context";
import { withTransitionDelay } from "@/lib/utils/timing";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();
  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login");
  if (!business) notFound();
  const { data: invoice } = await withTransitionDelay(
    supabase.from("invoices").select("*").eq("id", id).eq("business_id", business.id).maybeSingle(),
    700
  );
  if (!invoice) notFound();
  if (invoice.status === "cancelled" || invoice.status === "paid") redirect(`/dashboard/invoices/${id}`);
  return <div className="dashboard-content narrow-content"><Link className="back-link" href={`/dashboard/invoices/${id}`}>← Back to invoice</Link><header className="page-title"><p className="eyebrow">INVOICE · {invoice.invoice_number}</p><h1>Edit invoice</h1></header><InvoiceForm invoice={invoice} defaultCurrency={business.default_currency ?? "USD"} paymentTermsDays={business.default_payment_terms_days ?? 14} businessName={business.business_name} logoUrl={business.logo_url ?? ""} businessEmail={business.email} businessPhone={business.business_phone ?? ""} businessAddress={business.business_address ?? ""} websiteUrl={business.website_url ?? ""} taxRegistrationNumber={business.tax_registration_number ?? ""} defaultFooter={business.invoice_footer ?? "Thank you for your business."} /></div>;
}
