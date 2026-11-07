"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions/auth";
import { saveInvoiceAction } from "@/app/actions/invoices";
import type { Invoice } from "@/lib/invoices";

export default function InvoiceForm({ invoice }: { invoice?: Invoice }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveInvoiceAction, {});
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="business-form">
      {invoice && <input type="hidden" name="invoiceId" value={invoice.id} />}
      <div className="form-grid">
        <label>Invoice number<input name="invoiceNumber" required maxLength={64} defaultValue={invoice?.invoice_number} placeholder="INV-1001" /></label>
        <label>Customer name<input name="customerName" required maxLength={160} defaultValue={invoice?.customer_name} placeholder="Customer name" /></label>
        <label>Customer email <span>(optional)</span><input name="customerEmail" type="email" maxLength={320} defaultValue={invoice?.customer_email ?? ""} placeholder="name@example.com" /></label>
        <label>Amount<input name="amount" required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" defaultValue={invoice ? (invoice.amount_minor / 100).toFixed(2) : ""} placeholder="0.00" /></label>
        <label>Currency<select name="currency" defaultValue={invoice?.currency ?? "USD"}>{["USD", "EUR", "GBP", "ETB", "KES"].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
        <label>Issue date<input name="issueDate" type="date" required defaultValue={invoice?.issue_date ?? today} /></label>
        <label>Due date <span>(optional)</span><input name="dueDate" type="date" defaultValue={invoice?.due_date ?? ""} /></label>
        <label className="form-wide">Description<textarea name="description" required maxLength={2000} rows={4} defaultValue={invoice?.description} placeholder="What is this invoice for?" /></label>
      </div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <div className="form-actions">
        <button className="button button-dark" type="submit" name="intent" value="draft" disabled={pending}>
          {pending && <span className="button-spinner" aria-hidden="true" />}
          {pending ? "Saving…" : "Save draft"}
        </button>
        <button className="button button-outline" type="submit" name="intent" value="issue" disabled={pending}>
          {pending && <span className="button-spinner" aria-hidden="true" />}
          {pending ? "Saving…" : invoice?.status === "draft" ? "Issue invoice" : "Save changes"}
        </button>
      </div>
      <p className="form-help">Invoice amounts use exact cents. Paid status can only be set by verified settlement in a later payment phase.</p>
    </form>
  );
}
