"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { after } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { getBusinessContext } from "@/lib/auth/business-context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { processNearInvoiceRegistrationOutbox } from "@/lib/server/near-invoice-registration-outbox";
import { parseInvoiceForm } from "@/lib/invoices";
import type { FormState } from "./auth";

const LINK_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function triggerBackgroundNearRegistration(): void {
  after(async () => {
    try {
      await processNearInvoiceRegistrationOutbox(1);
    } catch {
      // Durable outbox in PostgreSQL is drained by scheduled worker or retry action
    }
  });
}

function createPayLinkCredentials(): { token: string; tokenHash: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const expiresAt = new Date(Date.now() + LINK_LIFETIME_MS).toISOString();
  return { token, tokenHash, expiresAt };
}

export async function saveInvoiceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login", RedirectType.replace);
  let values;
  try { values = parseInvoiceForm(formData); }
  catch (error) { return { error: error instanceof Error ? error.message : "Check the invoice details." }; }

  if (!business) return { error: "Business profile is unavailable. Contact support if the problem continues." };
  values.invoice_footer = values.invoice_footer || business.invoice_footer || "Thank you for your business.";
  const intent: "open" | "draft" = formData.get("intent") === "issue" ? "open" : "draft";
  const clientDraftId = String(formData.get("clientDraftId") ?? "").trim();
  const invoiceId = String(formData.get("invoiceId") ?? "");

  if (invoiceId) {
    const { data: existing, error: lookupError } = await supabase
      .from("invoices")
      .select("id,status,amount_minor,currency,invoice_number,share_token_hash")
      .eq("id", invoiceId)
      .eq("business_id", business.id)
      .maybeSingle();

    if (lookupError || !existing) return { error: "Invoice not found." };
    if (existing.status === "cancelled" || existing.status === "paid") return { error: "This invoice can no longer be edited." };
    if (existing.status !== "draft" && (existing.amount_minor !== values.amount_minor || existing.currency !== values.currency)) {
      return { error: "Issued invoice amount and currency cannot be changed. Cancel this invoice and create a replacement." };
    }

    const isTransitioningToOpen = intent === "open" && existing.status === "draft";
    const status = isTransitioningToOpen ? "open" : existing.status;

    let shareTokenUpdate: { share_token_hash?: string; share_token_expires_at?: string } = {};
    let issuedRedirectToken: string | null = null;

    if (isTransitioningToOpen) {
      if (!existing.share_token_hash) {
        const creds = createPayLinkCredentials();
        shareTokenUpdate = {
          share_token_hash: creds.tokenHash,
          share_token_expires_at: creds.expiresAt,
        };
        issuedRedirectToken = creds.token;
      }
    }

    const updateValues = {
      ...values,
      ...shareTokenUpdate,
      invoice_number: existing.invoice_number,
      seller_snapshot: isTransitioningToOpen ? {
        business_name: business.business_name,
        email: business.email,
        logo_url: business.logo_url ?? null,
        business_phone: business.business_phone ?? null,
        business_address: business.business_address ?? null,
        website_url: business.website_url ?? null,
        tax_registration_number: business.tax_registration_number ?? null,
        receiving_address: business.receiving_address,
        receiving_network: business.receiving_network,
        invoice_footer: values.invoice_footer,
      } : undefined,
      status,
    };

    const { error } = await supabase.from("invoices").update(updateValues).eq("id", invoiceId).eq("business_id", business.id);
    if (error) return { error: error.code === "23505" ? "That invoice number is already in use." : "Could not save the invoice. Check the details and try again." };

    if (isTransitioningToOpen) {
      triggerBackgroundNearRegistration();
    }

    revalidatePath("/dashboard/invoices");
    revalidatePath(`/dashboard/invoices/${invoiceId}`);

    if (isTransitioningToOpen) {
      redirect(`/dashboard/invoices/${invoiceId}?issued=1${issuedRedirectToken ? `&token=${issuedRedirectToken}` : ""}`, RedirectType.replace);
    }
    redirect(`/dashboard/invoices/${invoiceId}`, RedirectType.replace);
  }

  const { data: allocatedNumber, error: numberError } = await supabase.rpc("allocate_invoice_number", { p_business_id: business.id });
  if (numberError || !allocatedNumber) return { error: "Could not allocate an invoice number. Apply the invoice workflow migration and try again." };

  let shareTokenFields: { share_token_hash?: string; share_token_expires_at?: string } = {};
  let issuedRedirectToken: string | null = null;

  if (intent === "open") {
    const creds = createPayLinkCredentials();
    shareTokenFields = {
      share_token_hash: creds.tokenHash,
      share_token_expires_at: creds.expiresAt,
    };
    issuedRedirectToken = creds.token;
  }

  const insertPayload = {
    ...values,
    id: UUID_PATTERN.test(clientDraftId) ? clientDraftId : undefined,
    invoice_number: allocatedNumber,
    business_id: business.id,
    status: intent,
    seller_snapshot: {
      business_name: business.business_name,
      email: business.email,
      logo_url: business.logo_url ?? null,
      business_phone: business.business_phone ?? null,
      business_address: business.business_address ?? null,
      website_url: business.website_url ?? null,
      tax_registration_number: business.tax_registration_number ?? null,
      receiving_address: business.receiving_address,
      receiving_network: business.receiving_network,
      invoice_footer: values.invoice_footer,
    },
    ...shareTokenFields,
  };

  const { data: invoice, error } = await supabase.from("invoices").insert(insertPayload).select("id").single();
  if (error) {
    if (error.code === "23505" && UUID_PATTERN.test(clientDraftId)) {
      revalidatePath("/dashboard/invoices");
      revalidatePath(`/dashboard/invoices/${clientDraftId}`);
      redirect(`/dashboard/invoices/${clientDraftId}`, RedirectType.replace);
    }
    return { error: error.code === "23505" ? "That invoice number is already in use." : "Could not create the invoice. Check the details and try again." };
  }
  if (!invoice) return { error: "Could not create the invoice. Check the details and try again." };

  if (intent === "open") {
    triggerBackgroundNearRegistration();
  }

  revalidatePath("/dashboard/invoices");
  revalidatePath(`/dashboard/invoices/${invoice.id}`);

  if (intent === "open") {
    redirect(`/dashboard/invoices/${invoice.id}?issued=1${issuedRedirectToken ? `&token=${issuedRedirectToken}` : ""}`, RedirectType.replace);
  }
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
