"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { getBusinessContext } from "@/lib/auth/business-context";
import { parseInvoiceForm } from "@/lib/invoices";
import type { FormState } from "./auth";

export async function saveInvoiceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login", RedirectType.replace);
  let values;
  try { values = parseInvoiceForm(formData); }
  catch (error) { return { error: error instanceof Error ? error.message : "Check the invoice details." }; }

  if (!business) return { error: "Business profile is unavailable. Contact support if the problem continues." };
  const intent = formData.get("intent") === "issue" ? "open" : "draft";
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (invoiceId) {
    const { data: existing, error: lookupError } = await supabase
      .from("invoices")
      .select("id,status")
      .eq("id", invoiceId)
      .eq("business_id", business.id)
      .maybeSingle();

    if (lookupError || !existing) return { error: "Invoice not found." };
    if (existing.status === "cancelled" || existing.status === "paid") return { error: "This invoice can no longer be edited." };
    const status = intent === "open" && existing.status === "draft" ? "open" : existing.status;
    const { error } = await supabase.from("invoices").update({ ...values, status }).eq("id", invoiceId).eq("business_id", business.id);
    if (error) return { error: error.code === "23505" ? "That invoice number is already in use." : "Could not save the invoice. Check the details and try again." };
    revalidatePath("/dashboard", "layout");
    redirect(`/dashboard/invoices/${invoiceId}`, RedirectType.replace);
  }

  const { data: invoice, error } = await supabase.from("invoices").insert({ ...values, business_id: business.id, status: intent }).select("id").single();
  if (error || !invoice) return { error: error?.code === "23505" ? "That invoice number is already in use." : "Could not create the invoice. Check the details and try again." };
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/invoices/${invoice.id}`, RedirectType.replace);
}

export async function cancelInvoiceAction(formData: FormData) {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login", RedirectType.replace);
  if (!business) redirect("/dashboard?error=profile", RedirectType.replace);
  const { data: cancelled, error } = await supabase
    .from("invoices")
    .update({ status: "cancelled" })
    .eq("id", invoiceId)
    .eq("business_id", business.id)
    .in("status", ["draft", "open", "overdue"])
    .select("id")
    .maybeSingle();

  revalidatePath("/dashboard", "layout");
  if (error || !cancelled) redirect(`/dashboard/invoices/${invoiceId}?error=cancel`, RedirectType.replace);
  redirect(`/dashboard/invoices/${invoiceId}?cancelled=1`, RedirectType.replace);
}
