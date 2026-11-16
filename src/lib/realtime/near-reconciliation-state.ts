export type NearReconciliationStatus = "pending" | "processing" | "submitted" | "retrying" | "blocked";

export type NearReconciliationUpdate = {
  business_id: string;
  invoice_id: string;
  reconciliation_id: string;
  status: NearReconciliationStatus;
  near_transaction_hash: string | null;
};

const statuses = new Set<NearReconciliationStatus>([
  "pending", "processing", "submitted", "retrying", "blocked",
]);

export function parseNearReconciliationUpdate(
  value: unknown,
  activeBusinessId: string,
): NearReconciliationUpdate | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.business_id !== activeBusinessId
    || typeof row.invoice_id !== "string"
    || typeof row.reconciliation_id !== "string"
    || !statuses.has(row.status as NearReconciliationStatus)) return null;

  return {
    business_id: activeBusinessId,
    invoice_id: row.invoice_id,
    reconciliation_id: row.reconciliation_id,
    status: row.status as NearReconciliationStatus,
    near_transaction_hash: row.status === "submitted" && typeof row.near_transaction_hash === "string"
      ? row.near_transaction_hash
      : null,
  };
}
