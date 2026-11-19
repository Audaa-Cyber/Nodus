"use client";
import { useActionState, useEffect, useState } from "react";
import Image from "next/image";
import { saveInvoiceDefaultsAction } from "@/app/actions/invoice-defaults";
import type { FormState } from "@/app/actions/auth";
export default function InvoiceDefaultsForm({logoUrl,invoicePrefix,defaultCurrency,paymentTermsDays,invoiceFooter,businessPhone,businessAddress,websiteUrl,taxRegistrationNumber}:{logoUrl:string;invoicePrefix:string;defaultCurrency:string;paymentTermsDays:number;invoiceFooter:string;businessPhone:string;businessAddress:string;websiteUrl:string;taxRegistrationNumber:string}) {
 const [state,action,pending]=useActionState<FormState,FormData>(saveInvoiceDefaultsAction,{});
 const [previewUrl,setPreviewUrl]=useState(logoUrl);
 useEffect(()=>()=>{if(previewUrl.startsWith("blob:"))URL.revokeObjectURL(previewUrl)},[previewUrl]);
 return <section className="card-perspective" style={{marginTop:24}}><div className="aether-card p-4 sm:p-8">
 <h2 className="text-lg font-semibold mb-5">Invoice defaults</h2>
 <form action={action} className="business-form"><div className="form-grid">
 <div className="form-wide logo-source-fields"><label>Business logo <span>(optional)</span><input type="file" name="logoFile" accept="image/png,image/jpeg,image/webp" onChange={(event)=>{const file=event.currentTarget.files?.[0];const url=event.currentTarget.form?.elements.namedItem("logoUrl");if(url instanceof HTMLInputElement)url.value="";if(file){setPreviewUrl(URL.createObjectURL(file));}else{setPreviewUrl("");}}}/></label><p className="form-help">PNG, JPG or WebP. Max 2 MB.</p><label>Or use a logo URL<input type="url" name="logoUrl" maxLength={2048} defaultValue={logoUrl} placeholder="https://example.com/logo.png" onChange={(event)=>{const file=event.currentTarget.form?.elements.namedItem("logoFile");if(file instanceof HTMLInputElement)file.value="";setPreviewUrl(event.currentTarget.value.trim());}}/></label>{previewUrl&&<div className="logo-preview"><Image src={previewUrl} alt="Business logo preview" width={150} height={48} unoptimized/><span>Preview</span></div>}</div>
 <label>Business phone <span>(optional)</span><input name="businessPhone" maxLength={80} defaultValue={businessPhone} placeholder="+251…"/></label>
 <label>Website <span>(optional)</span><input type="url" name="websiteUrl" maxLength={2048} defaultValue={websiteUrl} placeholder="https://…"/></label>
 <label className="form-wide">Business address <span>(optional)</span><textarea name="businessAddress" rows={2} maxLength={500} defaultValue={businessAddress}/></label>
 <label>Tax registration number <span>(optional)</span><input name="taxRegistrationNumber" maxLength={100} defaultValue={taxRegistrationNumber}/></label>
 <label>Invoice prefix<input name="invoicePrefix" required maxLength={16} pattern="[A-Za-z0-9-]+" defaultValue={invoicePrefix}/></label>
 <label>Default currency<select name="defaultCurrency" defaultValue={defaultCurrency}>{["USDC","USDT","EURC"].map(c=><option key={c}>{c}</option>)}</select></label>
 <label>Payment terms<select name="paymentTermsDays" defaultValue={String(paymentTermsDays)}>{[0,7,14,30,45,60].map(d=><option key={d} value={d}>{d===0?"Due on receipt":d+" days"}</option>)}</select></label>
 <label className="form-wide">Thank-you note<textarea name="invoiceFooter" rows={3} maxLength={1000} defaultValue={invoiceFooter}/></label></div>
 {state.error&&<p className="form-error" role="alert">{state.error}</p>}{state.success&&<p className="form-success" role="status">{state.success}</p>}
 <div className="form-actions"><button className="button button-dark" disabled={pending}>{pending?"Saving…":"Save invoice defaults"}</button></div>
 </form></div></section>;
}
