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

export type NearOutboxJob = {
  id: string;
  reconciliation_id: string;
  lock_token: string;
  near_transaction_hash?: string | null;
};
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
    recordSubmission: (job: NearOutboxJob, transactionHash: string) => Promise<void>;
    markSubmitted: (job: NearOutboxJob, transactionHash: string | null) => Promise<void>;
    scheduleRetry: (job: NearOutboxJob, errorCode: string) => Promise<void>;
    markBlocked: (job: NearOutboxJob, errorCode: string) => Promise<void>;
    measureStage?: <T>(stage: string, operation: () => PromiseLike<T>) => Promise<T>;
  },
): Promise<"submitted" | "retry" | "blocked"> {
  const measure = dependencies.measureStage ?? ((_stage, operation) => operation());
  const [payloadResult, settlementResult] = await Promise.allSettled([
    measure("payload_load", () => dependencies.loadPayload(job)),
    measure("settlement_read_before_send", () => dependencies.getSettlement(job.reconciliation_id)),
  ]);
  if (payloadResult.status === "rejected") {
    if (isPermanent(payloadResult.reason)) {
      await dependencies.markBlocked(job, payloadResult.reason.code);
      return "blocked";
    }
    await dependencies.scheduleRetry(job, "near_outbox_payload_unavailable");
    return "retry";
  }
  if (settlementResult.status === "rejected") {
    await dependencies.scheduleRetry(job, "near_rpc_unavailable");
    return "retry";
  }
  const payload = payloadResult.value;
  const existing = settlementResult.value;
  if (existing) {
    if (!settlementMatches(payload.settlementRecord, existing)) {
      await dependencies.markBlocked(job, "near_existing_settlement_mismatch");
      return "blocked";
    }
    await measure("outbox_mark_submitted", () => dependencies.markSubmitted(job, job.near_transaction_hash ?? null));
    return "submitted";
  }

  // A finalized transaction hash is persisted before readback. If a later view
  // call is stale or temporarily unavailable, retry readback without signing a
  // second settlement transaction.
  if (job.near_transaction_hash) {
    await dependencies.scheduleRetry(job, "near_readback_pending");
    return "retry";
  }

  let submittedTransactionHash: string | null = null;
  try {
    await measure("registry_sync", () => dependencies.ensureInvoiceAndAttempt(payload));
  } catch (error) {
    if (isPermanent(error)) {
      await dependencies.markBlocked(job, error.code);
      return "blocked";
    }
    await dependencies.scheduleRetry(job, "near_registry_sync_failed");
    return "retry";
  }

  try {
    const transactionHash = await measure("attest_submit_and_finality", () => dependencies.attestSettlement(payload.attestationArgs.input));
    submittedTransactionHash = transactionHash;
    await measure("submission_persist", () => dependencies.recordSubmission(job, transactionHash));
    let verified: NearSettlementRecord | null;
    try {
      verified = await measure("settlement_readback", () => dependencies.getSettlement(job.reconciliation_id));
    } catch {
      await dependencies.scheduleRetry(job, "near_readback_unavailable");
      return "retry";
    }
    if (!verified) {
      await dependencies.scheduleRetry(job, "near_readback_pending");
      return "retry";
    }
    if (!settlementMatches(payload.settlementRecord, verified)) {
      await dependencies.markBlocked(job, "near_existing_settlement_mismatch");
      return "blocked";
    }
    await measure("outbox_mark_submitted", () => dependencies.markSubmitted(job, transactionHash));
    return "submitted";
  } catch (error) {
    let recovered: NearSettlementRecord | null;
    try {
      recovered = await measure("settlement_readback_after_uncertain_submission", () => dependencies.getSettlement(job.reconciliation_id));
    } catch {
      await dependencies.scheduleRetry(job, "near_submission_uncertain");
      return "retry";
    }
    if (recovered) {
      if (!settlementMatches(payload.settlementRecord, recovered)) {
        await dependencies.markBlocked(job, "near_existing_settlement_mismatch");
        return "blocked";
      }
      await measure("outbox_mark_submitted", () => dependencies.markSubmitted(job, submittedTransactionHash));
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
