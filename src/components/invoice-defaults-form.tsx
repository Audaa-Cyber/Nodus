"use client";
import { useActionState } from "react";
import { saveInvoiceDefaultsAction } from "@/app/actions/invoice-defaults";
import type { FormState } from "@/app/actions/auth";
export default function InvoiceDefaultsForm({logoUrl,invoicePrefix,defaultCurrency,paymentTermsDays,invoiceFooter,businessPhone,businessAddress,websiteUrl,taxRegistrationNumber}:{logoUrl:string;invoicePrefix:string;defaultCurrency:string;paymentTermsDays:number;invoiceFooter:string;businessPhone:string;businessAddress:string;websiteUrl:string;taxRegistrationNumber:string}) {
 const [state,action,pending]=useActionState<FormState,FormData>(saveInvoiceDefaultsAction,{});
 return <section className="card-perspective" style={{marginTop:24}}><div className="aether-card p-6 sm:p-8">
 <h2 className="text-lg font-semibold mb-1">Invoice defaults</h2><p className="text-xs mb-6" style={{color:"var(--text-secondary)"}}>Set these once and reuse them on new invoices.</p>
 <form action={action} className="business-form"><div className="form-grid">
 <label className="form-wide">Company logo <span>(optional)</span><input type="file" name="logoFile" accept="image/png,image/jpeg,image/webp" onChange={(event)=>{if(event.currentTarget.files?.length){const url=event.currentTarget.form?.elements.namedItem("logoUrl");if(url instanceof HTMLInputElement)url.value="";}}}/><span className="form-help">Upload a PNG, JPG, or WebP image up to 2 MB. It appears at the top-left of invoices.</span><input type="url" name="logoUrl" maxLength={2048} defaultValue={logoUrl} placeholder="Or paste a public HTTPS logo URL" onChange={(event)=>{if(event.currentTarget.value.trim()){const file=event.currentTarget.form?.elements.namedItem("logoFile");if(file instanceof HTMLInputElement)file.value="";}}}/></label>
 <label>Business phone <span>(optional)</span><input name="businessPhone" maxLength={80} defaultValue={businessPhone} placeholder="+251…"/></label>
 <label>Website <span>(optional)</span><input type="url" name="websiteUrl" maxLength={2048} defaultValue={websiteUrl} placeholder="https://…"/></label>
 <label className="form-wide">Business address <span>(optional)</span><textarea name="businessAddress" rows={2} maxLength={500} defaultValue={businessAddress}/></label>
 <label>Tax registration number <span>(optional)</span><input name="taxRegistrationNumber" maxLength={100} defaultValue={taxRegistrationNumber}/></label>
 <label>Invoice prefix<input name="invoicePrefix" required maxLength={16} pattern="[A-Za-z0-9-]+" defaultValue={invoicePrefix}/></label>
 <label>Default currency<select name="defaultCurrency" defaultValue={defaultCurrency}>{["USD","EUR","GBP","ETB","KES"].map(c=><option key={c}>{c}</option>)}</select></label>
 <label>Payment terms<select name="paymentTermsDays" defaultValue={String(paymentTermsDays)}>{[0,7,14,30,45,60].map(d=><option key={d} value={d}>{d===0?"Due on receipt":d+" days"}</option>)}</select></label>
 <label className="form-wide">Default thank-you note<textarea name="invoiceFooter" rows={3} maxLength={1000} defaultValue={invoiceFooter}/></label></div>
 {state.error&&<p className="form-error" role="alert">{state.error}</p>}{state.success&&<p className="form-success" role="status">{state.success}</p>}
 <div className="form-actions"><button className="button button-dark" disabled={pending}>{pending?"Saving…":"Save invoice defaults"}</button></div>
 <p className="form-help">Numbers are assigned safely on the server and never reused, including for cancelled invoices.</p></form></div></section>;
}