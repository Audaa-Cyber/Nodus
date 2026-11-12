import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCircleChain } from "@/lib/server/circle";
import { buildNearSettlementPayload, type NearSettlementPayload } from "@/lib/payments/near-settlement-payload";
import { deliverClaimedNearSettlement, PermanentNearOutboxError } from "@/lib/payments/near-outbox-delivery";
import { createNearSettlementClient, isNearPermanentError } from "@/lib/server/near-settlement-client";

type OutboxJob = { id: string; reconciliation_id: string; lock_token: string };
type NearRecord = {
  reconciliation_id: string; invoice_id: string; attempt_id: string;
  source_transaction_hash: string; destination_transaction_hash: string;
  amount_base_units: string; evidence_digest: string;
};

const getString = (object: Record<string, unknown>, key: string) => object[key] == null ? "" : String(object[key]);

export async function processNearSettlementOutbox(limit = 10): Promise<{ claimed: number; submitted: number; retry: number; blocked: number }> {
  const admin = getSupabaseAdminClient();
  const near = createNearSettlementClient();
  const { data, error } = await admin.rpc("claim_near_settlement_outbox", { p_limit: limit });
  if (error) throw new Error("near_outbox_claim_failed");
  const jobs = (data ?? []) as OutboxJob[];
  const counts = { claimed: jobs.length, submitted: 0, retry: 0, blocked: 0 };
  for (const job of jobs) {
    const result = await deliverClaimedNearSettlement(job, {
      loadPayload: async (claimed) => {
        const { data: outbox, error: outboxError } = await admin.from("near_settlement_outbox").select("*")
          .eq("id", claimed.id).eq("lock_token", claimed.lock_token).single();
        if (outboxError || !outbox) throw new Error("near_outbox_job_unavailable");
        const [settlementResult, attemptResult, invoiceResult] = await Promise.all([
          admin.from("payment_settlements").select("*").eq("id", outbox.payment_settlement_id).single(),
          admin.from("payment_attempts").select("*").eq("id", outbox.payment_attempt_id).single(),
          admin.from("invoices").select("*").eq("id", outbox.invoice_id).single(),
        ]);
        if (settlementResult.error || attemptResult.error || invoiceResult.error) throw new Error("near_settlement_source_unavailable");
        const destinationNetwork = settlementResult.data.destination_network;
        const sourceNetwork = attemptResult.data.source_network;
        if (!destinationNetwork || !sourceNetwork) throw new Error("near_route_chain_missing");
        const destination = getCircleChain(destinationNetwork, true);
        const sourceChain = getCircleChain(sourceNetwork, true);
        if (!destination) throw new Error("near_destination_chain_configuration_missing");
        if (!sourceChain) throw new Error("near_source_chain_configuration_missing");
        const payload = buildNearSettlementPayload({
          settlement: settlementResult.data,
          attempt: attemptResult.data,
          invoice: invoiceResult.data,
          canonicalTokenAddress: destination.usdcAddress,
        });
        const evidence = settlementResult.data.evidence as Record<string, unknown>;
        const sourceProof = evidence.sourceProof as Record<string, unknown>;
        const destinationProof = evidence.destinationProof as Record<string, unknown>;
        const transaction = (destinationProof.transactions as Record<string, unknown>[])[0];
        const input = payload.attestationArgs.input;
        const settlementRecord: NearRecord = {
          reconciliation_id: input.reconciliation_id,
          invoice_id: settlementResult.data.invoice_id,
          attempt_id: settlementResult.data.payment_attempt_id,
          source_transaction_hash: String(sourceProof.sourceTransactionHash),
          destination_transaction_hash: String(transaction.transactionHash),
          amount_base_units: String(destinationProof.amount),
          evidence_digest: input.evidence_digest,
        };
        return { ...payload, settlementRecord };
      },
      getSettlement: async (reconciliationId) => {
        const value = await near.view<Record<string, unknown>>("get_settlement", { reconciliation_id: reconciliationId });
        if (!value) return null;
        return {
          reconciliation_id: getString(value, "reconciliation_id"),
          invoice_id: getString(value, "invoice_id"),
          attempt_id: getString(value, "attempt_id"),
          source_transaction_hash: getString(value, "source_transaction_hash"),
          destination_transaction_hash: getString(value, "destination_transaction_hash"),
          amount_base_units: getString(value, "amount_base_units"),
          evidence_digest: getString(value, "evidence_digest"),
        };
      },
      ensureInvoiceAndAttempt: async (payload) => {
        const invoice = payload.invoiceArgs as NearSettlementPayload["invoiceArgs"];
        const existingInvoice = await near.view<Record<string, unknown>>("get_invoice", { invoice_id: invoice.invoice_id });
        if (existingInvoice) {
          const terms = existingInvoice.terms as Record<string, unknown> | undefined;
          if (getString(existingInvoice, "invoice_id") !== invoice.invoice_id
            || !terms || Number(terms.destination_chain_id) !== invoice.terms.destination_chain_id
            || String(terms.amount_minor) !== invoice.terms.amount_minor
            || String(terms.currency).toUpperCase() !== invoice.terms.currency
            || Number(terms.token_decimals) !== invoice.terms.token_decimals
            || String(terms.token_address).toLowerCase() !== invoice.terms.token_address
            || String(terms.merchant_recipient).toLowerCase() !== invoice.terms.merchant_recipient) {
            throw new PermanentNearOutboxError("near_invoice_registry_mismatch");
          }
        } else {
          try { await near.call("register_invoice", invoice); }
          catch (error) {
            if (!isNearPermanentError(error)) throw error;
            throw new PermanentNearOutboxError("near_invoice_registration_rejected");
          }
        }
        const attempt = payload.attemptArgs as NearSettlementPayload["attemptArgs"];
        const existingAttempt = await near.view<Record<string, unknown>>("get_attempt", { attempt_id: attempt.attempt_id });
        const sourceTokenByChainId: Record<number, string> = {
          11155111: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
          84532: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
          421614: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d",
          11155420: "0x5fd84259d66cd46123540766be93dfe6d43130d7",
        };
        if (existingAttempt) {
          if (getString(existingAttempt, "attempt_id") !== attempt.attempt_id
            || getString(existingAttempt, "invoice_id") !== attempt.invoice_id
            || Number(existingAttempt.source_chain_id) !== attempt.source_chain_id
            || String(existingAttempt.source_token_address).toLowerCase() !== sourceTokenByChainId[attempt.source_chain_id]) {
            throw new PermanentNearOutboxError("near_attempt_registry_mismatch");
          }
        } else {
          try { await near.call("register_attempt", attempt); }
          catch (error) {
            if (!isNearPermanentError(error)) throw error;
            throw new PermanentNearOutboxError("near_attempt_registration_rejected");
          }
        }
      },
      attestSettlement: (input) => near.call("attest_settlement", { input }),
      markSubmitted: async (claimed, transactionHash) => {
        const { error: finishError } = await admin.rpc("finish_near_settlement_outbox", {
          p_id: claimed.id, p_lock_token: claimed.lock_token, p_near_transaction_hash: transactionHash,
        });
        if (finishError) throw new Error("near_outbox_finish_failed");
      },
      scheduleRetry: async (claimed, code) => {
        const { error: retryError } = await admin.rpc("retry_near_settlement_outbox", {
          p_id: claimed.id, p_lock_token: claimed.lock_token, p_error_code: code,
        });
        if (retryError) throw new Error("near_outbox_retry_failed");
      },
      markBlocked: async (claimed, code) => {
        const { error: blockedError } = await admin.rpc("block_near_settlement_outbox", {
          p_id: claimed.id, p_lock_token: claimed.lock_token, p_error_code: code,
        });
        if (blockedError) throw new Error("near_outbox_block_failed");
      },
    });
    counts[result] += 1;
  }
  return counts;
}
