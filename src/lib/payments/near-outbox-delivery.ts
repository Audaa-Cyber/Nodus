export type NearSettlementRecord = {
  reconciliation_id: string;
  invoice_id: string;
  attempt_id: string;
  source_transaction_hash: string;
  destination_transaction_hash: string;
  amount_base_units: string;
  evidence_digest: string;
  cctp_source_domain: number | null;
  cctp_message_nonce: string | null;
};

export type NearOutboxJob = { id: string; reconciliation_id: string; lock_token: string };
export type NearSettlementDeliveryPayload<TPayload> = {
  invoiceArgs: Record<string, unknown>;
  attemptArgs: Record<string, unknown>;
  attestationArgs: { input: TPayload };
  settlementRecord: NearSettlementRecord;
};

export class PermanentNearOutboxError extends Error {
  readonly permanent = true;
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PermanentNearOutboxError";
    this.code = code;
  }
}

function settlementMatches(expected: NearSettlementRecord, actual: NearSettlementRecord): boolean {
  return expected.reconciliation_id === actual.reconciliation_id
    && expected.invoice_id === actual.invoice_id
    && expected.attempt_id === actual.attempt_id
    && expected.source_transaction_hash.toLowerCase() === actual.source_transaction_hash.toLowerCase()
    && expected.destination_transaction_hash.toLowerCase() === actual.destination_transaction_hash.toLowerCase()
    && expected.amount_base_units === actual.amount_base_units
    && expected.evidence_digest.toLowerCase() === actual.evidence_digest.toLowerCase()
    && expected.cctp_source_domain === actual.cctp_source_domain
    && expected.cctp_message_nonce?.toLowerCase() === actual.cctp_message_nonce?.toLowerCase();
}

function isPermanent(error: unknown): error is PermanentNearOutboxError {
  return error instanceof PermanentNearOutboxError
    || Boolean(error && typeof error === "object" && "permanent" in error && error.permanent === true);
}

export async function deliverClaimedNearSettlement<TPayload>(
  job: NearOutboxJob,
  dependencies: {
    loadPayload: (job: NearOutboxJob) => Promise<NearSettlementDeliveryPayload<TPayload>>;
    getSettlement: (reconciliationId: string) => Promise<NearSettlementRecord | null>;
    ensureInvoiceAndAttempt: (payload: NearSettlementDeliveryPayload<TPayload>) => Promise<void>;
    attestSettlement: (input: TPayload) => Promise<string>;
    markSubmitted: (job: NearOutboxJob, transactionHash: string | null) => Promise<void>;
    scheduleRetry: (job: NearOutboxJob, errorCode: string) => Promise<void>;
    markBlocked: (job: NearOutboxJob, errorCode: string) => Promise<void>;
  },
): Promise<"submitted" | "retry" | "blocked"> {
  let payload: Awaited<ReturnType<typeof dependencies.loadPayload>>;
  try {
    payload = await dependencies.loadPayload(job);
  } catch (error) {
    if (isPermanent(error)) {
      await dependencies.markBlocked(job, error.code);
      return "blocked";
    }
    await dependencies.scheduleRetry(job, "near_outbox_payload_unavailable");
    return "retry";
  }

  let existing: NearSettlementRecord | null;
  try {
    existing = await dependencies.getSettlement(job.reconciliation_id);
  } catch {
    await dependencies.scheduleRetry(job, "near_rpc_unavailable");
    return "retry";
  }
  if (existing) {
    if (!settlementMatches(payload.settlementRecord, existing)) {
      await dependencies.markBlocked(job, "near_existing_settlement_mismatch");
      return "blocked";
    }
    await dependencies.markSubmitted(job, null);
    return "submitted";
  }

  try {
    await dependencies.ensureInvoiceAndAttempt(payload);
  } catch (error) {
    if (isPermanent(error)) {
      await dependencies.markBlocked(job, error.code);
      return "blocked";
    }
    await dependencies.scheduleRetry(job, "near_registry_sync_failed");
    return "retry";
  }

  try {
    const transactionHash = await dependencies.attestSettlement(payload.attestationArgs.input);
    await dependencies.markSubmitted(job, transactionHash);
    return "submitted";
  } catch (error) {
    let recovered: NearSettlementRecord | null;
    try {
      recovered = await dependencies.getSettlement(job.reconciliation_id);
    } catch {
      await dependencies.scheduleRetry(job, "near_submission_uncertain");
      return "retry";
    }
    if (recovered) {
      if (!settlementMatches(payload.settlementRecord, recovered)) {
        await dependencies.markBlocked(job, "near_existing_settlement_mismatch");
        return "blocked";
      }
      await dependencies.markSubmitted(job, null);
      return "submitted";
    }
    if (isPermanent(error)) {
      await dependencies.markBlocked(job, error.code);
      return "blocked";
    }
    await dependencies.scheduleRetry(job, "near_submission_uncertain");
    return "retry";
  }
}
