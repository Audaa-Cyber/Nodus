import Link from "next/link";
import InvoiceForm from "@/components/invoice-form";
import { withTransitionDelay } from "@/lib/utils/timing";

export default async function NewInvoicePage() {
  await withTransitionDelay(Promise.resolve(), 650);
  return <main className="dashboard-content narrow-content"><Link className="back-link" href="/dashboard/invoices">← Back to invoices</Link><header className="page-title"><p className="eyebrow">INVOICE MANAGEMENT</p><h1>New invoice</h1><p>Enter the details, then save it as a draft or issue it.</p></header><InvoiceForm /></main>;
}
