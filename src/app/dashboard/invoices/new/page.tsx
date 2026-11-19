import Link from "next/link";
import InvoiceForm from "@/components/invoice-form";
import { getBusinessContext } from "@/lib/auth/business-context";
export default async function NewInvoicePage(){
 const {business}=await getBusinessContext();
 return <div className="dashboard-content narrow-content"><Link className="back-link" href="/dashboard/invoices">← Back to invoices</Link><header className="page-title"><p className="eyebrow">INVOICE MANAGEMENT</p><h1>New invoice</h1></header><InvoiceForm defaultCurrency={business?.default_currency??"USDC"} paymentTermsDays={business?.default_payment_terms_days??14} businessName={business?.business_name??"Your business"} logoUrl={business?.logo_url??""} businessEmail={business?.email??""} businessPhone={business?.business_phone??""} businessAddress={business?.business_address??""} websiteUrl={business?.website_url??""} taxRegistrationNumber={business?.tax_registration_number??""} defaultFooter={business?.invoice_footer??"Thank you for your business."} businessNetworks={business?.receiving_networks??[]} businessReceivingAddress={business?.receiving_address??""}/></div>;
}
