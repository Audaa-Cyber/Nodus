"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { getBusinessContext } from "@/lib/auth/business-context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { processNearInvoiceRegistrationOutbox } from "@/lib/server/near-invoice-registration-outbox";
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
      .select("id,status,amount_minor,currency")
      .eq("id", invoiceId)
      .eq("business_id", business.id)
      .maybeSingle();

    if (lookupError || !existing) return { error: "Invoice not found." };
    if (existing.status === "cancelled" || existing.status === "paid") return { error: "This invoice can no longer be edited." };
    if (existing.status !== "draft" && (existing.amount_minor !== values.amount_minor || existing.currency !== values.currency)) {
      return { error: "Issued invoice amount and currency cannot be changed. Cancel this invoice and create a replacement." };
    }
    const status = intent === "open" && existing.status === "draft" ? "open" : existing.status;
    const { error } = await supabase.from("invoices").update({ ...values, status }).eq("id", invoiceId).eq("business_id", business.id);
    if (error) return { error: error.code === "23505" ? "That invoice number is already in use." : "Could not save the invoice. Check the details and try again." };
    if (status === "open" && existing.status === "draft") {
      try { await processNearInvoiceRegistrationOutbox(1); } catch { /* The durable outbox is drained by the scheduled worker. */ }
    }
    revalidatePath("/dashboard", "layout");
    redirect(`/dashboard/invoices/${invoiceId}`, RedirectType.replace);
  }

  const { data: invoice, error } = await supabase.from("invoices").insert({ ...values, business_id: business.id, status: intent }).select("id").single();
  if (error || !invoice) return { error: error?.code === "23505" ? "That invoice number is already in use." : "Could not create the invoice. Check the details and try again." };
  if (intent === "open") {
    try { await processNearInvoiceRegistrationOutbox(1); } catch { /* The durable outbox is drained by the scheduled worker. */ }
  }
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

export async function retryNearInvoiceRegistrationAction(formData: FormData) {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login", RedirectType.replace);
  if (!business || !/^[0-9a-f-]{36}$/i.test(invoiceId)) redirect("/dashboard", RedirectType.replace);
  const { data: invoice } = await supabase.from("invoices").select("id")
    .eq("id", invoiceId).eq("business_id", business.id).maybeSingle();
  if (!invoice) redirect("/dashboard", RedirectType.replace);
  await getSupabaseAdminClient().rpc("requeue_near_invoice_registration", { p_invoice_id: invoiceId });
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  redirect(`/dashboard/invoices/${invoiceId}`, RedirectType.replace);
}
