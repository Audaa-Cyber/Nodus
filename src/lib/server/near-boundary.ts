import "server-only";
import type { NearServerConfig } from "@/types/near";

/**
 * Server-Only NEAR Intents Boundary.
 *
 * CRITICAL ARCHITECTURAL SAFEGUARD:
 * 1. Enforced by "server-only". Client components attempting to import this module
 *    will cause Next.js compilation to fail immediately.
 * 2. Isolates future settlement verification and NEAR private keys to secure server contexts.
 * 3. PHASE 1 SCOPE: Payment processing and NEAR Intents execution are strictly out of scope.
 *    No live transaction submission, wallet signing, or RPC execution occurs here.
 */

/**
 * Validates whether the server environment contains valid NEAR credentials.
 * (Scaffolded for Phase 2).
 */
export function isNearServerConfigured(): boolean {
  const nodeUrl = process.env.NEAR_RPC_URL;
  const contractId = process.env.NEAR_INTENTS_CONTRACT_ID;
  const signerId = process.env.NEAR_SIGNER_ACCOUNT_ID;
  const signerKey = process.env.NEAR_SIGNER_PRIVATE_KEY;

  return Boolean(nodeUrl && contractId && signerId && signerKey);
}

/**
 * Retrieves the validated server-side NEAR configuration.
 * Throws an explicit error if accessed before configuration.
 */
export function getNearServerConfig(): NearServerConfig {
  if (!isNearServerConfigured()) {
    throw new Error(
      "[NODUS SERVER ERROR] NEAR Intents server credentials are not configured.\n" +
      "This service is scaffolded for Phase 2. Payment processing is disabled in Phase 1."
    );
  }

  return {
    networkId: (process.env.NEAR_NETWORK_ID || "testnet") as "mainnet" | "testnet",
    nodeUrl: process.env.NEAR_RPC_URL!,
    contractId: process.env.NEAR_INTENTS_CONTRACT_ID!,
    signerAccountId: process.env.NEAR_SIGNER_ACCOUNT_ID!,
    signerPrivateKey: process.env.NEAR_SIGNER_PRIVATE_KEY!,
  };
}

