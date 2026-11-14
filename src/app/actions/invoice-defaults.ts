"use server";
import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { getBusinessContext,invalidateBusinessProfileCache } from "@/lib/auth/business-context";
import type { FormState } from "./auth";
export async function saveInvoiceDefaultsAction(_previous:FormState,formData:FormData):Promise<FormState>{
 let logoUrl=String(formData.get("logoUrl")??"").trim(); const logoFile=formData.get("logoFile"); const invoicePrefix=String(formData.get("invoicePrefix")??"").trim().toUpperCase(),defaultCurrency=String(formData.get("defaultCurrency")??"").trim().toUpperCase(),paymentTermsDays=Number(formData.get("paymentTermsDays")),invoiceFooter=String(formData.get("invoiceFooter")??"").trim();
 if(logoUrl&&(logoUrl.length>2048||!/^https:\/\//i.test(logoUrl)))return{error:"Use a public HTTPS URL for the logo."};
 if(logoFile instanceof File && logoFile.size>0 && (!(["image/png","image/jpeg","image/webp"].includes(logoFile.type)) || logoFile.size>2*1024*1024)) return {error:"Choose a PNG, JPG, or WebP logo up to 2 MB."};
 if(!/^[A-Z0-9-]{1,16}$/.test(invoicePrefix))return{error:"Use a prefix of 1–16 letters, numbers, or hyphens."};
 if(!["USD","EUR","GBP","ETB","KES"].includes(defaultCurrency))return{error:"Choose a supported currency."};
 if(![0,7,14,30,45,60].includes(paymentTermsDays))return{error:"Choose a supported payment term."};
 if(invoiceFooter.length>1000)return{error:"Thank-you note must be 1,000 characters or fewer."};
 const {supabase,user,business}=await getBusinessContext();if(!user)redirect("/login",RedirectType.replace);if(!business)return{error:"Business profile is unavailable."};
 if(logoFile instanceof File && logoFile.size>0){
  const ext=logoFile.type==="image/png"?"png":logoFile.type==="image/webp"?"webp":"jpg";
  const path=`${business.id}/logo-${Date.now()}.${ext}`;
  const {error:uploadError}=await supabase.storage.from("business-logos").upload(path,logoFile,{contentType:logoFile.type,cacheControl:"3600",upsert:false});
  if(uploadError)return {error:"Logo upload failed. Apply the latest migration and try again."};
  const {data:publicUrl}=supabase.storage.from("business-logos").getPublicUrl(path); logoUrl=publicUrl.publicUrl;
 }
 const {error}=await supabase.from("business_profiles").update({logo_url:logoUrl||null,invoice_prefix:invoicePrefix,default_currency:defaultCurrency,default_payment_terms_days:paymentTermsDays,invoice_footer:invoiceFooter||"Thank you for your business."}).eq("owner_user_id",user.id);
 if(error)return{error:"Could not save invoice defaults. Apply the latest database migration and try again."};
 invalidateBusinessProfileCache(user.id);revalidatePath("/dashboard","layout");revalidatePath("/dashboard/settings");return{success:"Invoice defaults saved."};
}