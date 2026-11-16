/**
 * NEAR Settlement Service Contracts (Scaffolded for Phase 2).
 *
 * NOTE: Payment processing execution is strictly forbidden in Phase 1.
 * This file specifies the architectural contract and interface boundaries only.
 */

export type SettlementStatus = "pending" | "submitted" | "verified" | "failed";

export interface SettlementVerificationRequest {
  invoiceId: string;
  expectedAmount: number;
  expectedCurrency: string;
  transactionHash: string;
}

export interface SettlementVerificationResult {
  verified: boolean;
  status: SettlementStatus;
  confirmedAt?: string;
  blockNumber?: number;
}

/**
 * Interface contract for the NEAR Settlement Service.
 */
export interface INearSettlementService {
  verifySettlement(
    request: SettlementVerificationRequest
  ): Promise<SettlementVerificationResult>;
}

