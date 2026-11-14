import Link from "next/link";
import InvoiceForm from "@/components/invoice-form";
import { getBusinessContext } from "@/lib/auth/business-context";
import { withTransitionDelay } from "@/lib/utils/timing";
export default async function NewInvoicePage(){
 const {business}=await getBusinessContext(); await withTransitionDelay(Promise.resolve(),400);
 return <div className="dashboard-content narrow-content"><Link className="back-link" href="/dashboard/invoices">← Back to invoices</Link><header className="page-title"><p className="eyebrow">INVOICE MANAGEMENT</p><h1>New invoice</h1><p>Add line items; Nodus calculates the totals and assigns a unique invoice number.</p></header><InvoiceForm defaultCurrency={business?.default_currency??"USD"} paymentTermsDays={business?.default_payment_terms_days??14} businessName={business?.business_name??"Your business"} logoUrl={business?.logo_url??""} businessEmail={business?.email??""} businessPhone={business?.business_phone??""} businessAddress={business?.business_address??""} websiteUrl={business?.website_url??""} taxRegistrationNumber={business?.tax_registration_number??""} defaultFooter={business?.invoice_footer??"Thank you for your business."}/></div>;
}