import "server-only";

import { getCircleChain } from "@/lib/server/circle";
import { deliverNearInvoiceRegistration, PermanentNearInvoiceRegistrationError, type NearInvoiceArgs, type NearInvoiceRegistrationJob } from "@/lib/payments/near-invoice-registration";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createNearSettlementClient, isNearPermanentError } from "@/lib/server/near-settlement-client";

export async function processNearInvoiceRegistrationOutbox(limit = 10): Promise<{ claimed: number; registered: number; retry: number; failed: number }> {
  const admin = getSupabaseAdminClient();
  const near = createNearSettlementClient();
  const { data, error } = await admin.rpc("claim_near_invoice_registration_outbox", { p_limit: limit });
  if (error) throw new Error("near_invoice_registration_claim_failed");
  const jobs = (data ?? []) as (NearInvoiceRegistrationJob & { near_transaction_hash: string | null })[];
  const counts = { claimed: jobs.length, registered: 0, retry: 0, failed: 0 };

  for (const job of jobs) {
    let args: NearInvoiceArgs;
    try {
      const { data: invoice, error: invoiceError } = await admin.from("invoices").select("id,business_id,amount_minor,currency,status")
        .eq("id", job.invoice_id).single();
      if (invoiceError || !invoice) throw new Error("near_invoice_source_unavailable");
      const { data: business, error: businessError } = await admin.from("business_profiles")
        .select("receiving_address,receiving_network").eq("id", invoice.business_id).single();
      if (businessError || !business) throw new Error("near_invoice_business_unavailable");
      const chain = getCircleChain(String(business.receiving_network ?? ""), true);
      const recipient = String(business.receiving_address ?? "").toLowerCase();
      if (invoice.currency !== "USD" || !chain || !/^0x[0-9a-f]{40}$/.test(recipient)
        || !Number.isSafeInteger(invoice.amount_minor) || invoice.amount_minor < 1) {
        throw new PermanentNearInvoiceRegistrationError("near_invoice_terms_unsupported");
      }
      args = {
        invoice_id: invoice.id,
        terms: {
          currency: "USD",
          amount_minor: String(invoice.amount_minor),
          destination_chain_id: chain.chainId,
          token_decimals: 6,
          token_address: chain.usdcAddress.toLowerCase(),
          merchant_recipient: recipient,
        },
      };
    } catch (error) {
      if (error instanceof PermanentNearInvoiceRegistrationError) {
        const result = await admin.rpc("fail_near_invoice_registration", { p_id: job.id, p_lock_token: job.lock_token, p_failure_reason: error.code });
        if (result.error) throw new Error("near_invoice_registration_fail_failed");
        counts.failed += 1;
      } else {
        const result = await admin.rpc("retry_near_invoice_registration", { p_id: job.id, p_lock_token: job.lock_token, p_failure_reason: "near_invoice_source_unavailable" });
        if (result.error) throw new Error("near_invoice_registration_retry_failed");
        counts.retry += 1;
      }
      continue;
    }

    const result = await deliverNearInvoiceRegistration(job, args, job.near_transaction_hash, {
      getInvoice: async (invoiceId) => await near.view<Record<string, unknown>>("get_invoice", { invoice_id: invoiceId }),
      registerInvoice: async (invoiceArgs) => {
        try { return await near.call("register_invoice", invoiceArgs); }
        catch (error) {
          if (isNearPermanentError(error)) throw new PermanentNearInvoiceRegistrationError("near_invoice_registration_rejected");
          throw error;
        }
      },
      markSubmitted: async (claimed, transactionHash) => {
        const { error: submitError } = await admin.rpc("mark_near_invoice_registration_submitted", {
          p_id: claimed.id, p_lock_token: claimed.lock_token, p_transaction_hash: transactionHash,
        });
        if (submitError) throw new Error("near_invoice_registration_submit_record_failed");
      },
      markRegistered: async (claimed, transactionHash, invoiceReference) => {
        const { error: finishError } = await admin.rpc("finish_near_invoice_registration", {
          p_id: claimed.id, p_lock_token: claimed.lock_token,
          p_transaction_hash: transactionHash, p_invoice_reference: invoiceReference,
        });
        if (finishError) throw new Error("near_invoice_registration_finish_failed");
      },
      retry: async (claimed, code) => {
        const { error: retryError } = await admin.rpc("retry_near_invoice_registration", {
          p_id: claimed.id, p_lock_token: claimed.lock_token, p_failure_reason: code,
        });
        if (retryError) throw new Error("near_invoice_registration_retry_failed");
      },
      fail: async (claimed, code) => {
        const { error: failError } = await admin.rpc("fail_near_invoice_registration", {
          p_id: claimed.id, p_lock_token: claimed.lock_token, p_failure_reason: code,
        });
        if (failError) throw new Error("near_invoice_registration_fail_failed");
      },
    });
    counts[result] += 1;
  }
  return counts;
}
