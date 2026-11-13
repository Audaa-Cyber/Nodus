import { createHash } from "node:crypto";
import { NextResponse } from "next/server.js";
import { getSupabaseAdminClient } from "../../../../../../../lib/supabase/admin.ts";
import { isServerSupabaseConfigured } from "../../../../../../../config/env.server.ts";
import { getCircleChain, fetchCircleCctpStatus } from "../../../../../../../lib/server/circle.ts";
import { verifyEvmDestinationTransfers } from "../../../../../../../lib/server/settlement-chain.ts";
import {
  verifyCctpV2DestinationTransaction,
  verifyCctpV2SourceTransaction,
} from "../../../../../../../lib/server/cctp-v2-chain.ts";
import { assetUnitsToInvoiceMinor } from "../../../../../../../lib/payments/settlement-policy.ts";
import { verifyImmutableAttemptInvoiceBinding } from "../../../../../../../lib/payments/cctp-v2-integrity.ts";
import { processNearSettlementOutbox } from "../../../../../../../lib/server/near-settlement-outbox.ts";

export const dynamic = "force-dynamic";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPendingOrTransientError(error: unknown): boolean {
  if (!error) return false;
  const detail = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /transactionreceiptnotfound|transactionnotfound|blocknotfound|receipt.*(?:not found|could not be found)|could not be found|fetch failed|http request failed|timeout|timed out|network|connection|rate limit|too many requests|econnreset|etimedout|socket|bad gateway|service unavailable|gateway timeout|502|503|504|429|iris_api_status|cctp_attestation_lookup_failed|cctp_verification_rpc_not_configured|settlement_chain_not_configured/i.test(detail);
}

function classifyError(error: unknown): {
  isTransient: boolean;
  isOperatorConfig: boolean;
  failureCode: string;
  sanitizedMessage: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  if (/cctp_verification_rpc_not_configured|settlement_chain_not_configured/i.test(message)) {
    return {
      isTransient: true,
      isOperatorConfig: true,
      failureCode: "operator_rpc_not_configured",
      sanitizedMessage: "Settlement verification RPC endpoint or confirmation count is not configured by operator.",
    };
  }
  if (isPendingOrTransientError(error)) {
    return {
      isTransient: true,
      isOperatorConfig: false,
      failureCode: "transient_provider_error",
      sanitizedMessage: "A temporary network or blockchain RPC delay occurred. Verification will retry automatically.",
    };
  }
  return {
    isTransient: false,
    isOperatorConfig: false,
    failureCode: message.slice(0, 50).replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase(),
    sanitizedMessage: "Payment verification encountered an unexpected state requiring operator review.",
  };
}

function publicAttempt<T extends Record<string, unknown>>(attempt: T): Omit<T, "quote_snapshot"> {
  const safe = { ...attempt } as Record<string, unknown>;
  delete safe.quote_snapshot;
  return safe as Omit<T, "quote_snapshot">;
}

function usdcToUnits(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d+(\.\d{1,6})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))).toString();
}

async function saveRecovery(
  supabaseAdmin: ReturnType<typeof getSupabaseAdminClient>,
  attemptId: string,
  state: string,
  input: { nonce?: string; messageHash?: string; destinationTxHashes?: string[] } = {},
) {
  await supabaseAdmin.rpc("record_circle_recovery_progress", {
    p_attempt_id: attemptId,
    p_state: state,
    p_message_nonce: input.nonce ?? null,
    p_message_hash: input.messageHash ?? null,
    p_destination_tx_hashes: input.destinationTxHashes ?? [],
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  if (!TOKEN_PATTERN.test(token) || !UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "attempt_unavailable" }, { status: 404 });
  }
  if (!isServerSupabaseConfigured()) {
    return NextResponse.json({ error: "server_not_configured" }, { status: 503 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");

  try {
    const { data: attemptRows, error: fetchErr } = await supabaseAdmin.rpc("get_shared_live_attempt", {
      p_token_hash: tokenHash,
      p_attempt_id: id,
    });
    if (fetchErr || !attemptRows?.length) {
      return NextResponse.json({ error: "attempt_unavailable" }, { status: 404 });
    }

    const attempt = attemptRows[0];
    const { data: contextRows } = await supabaseAdmin.rpc("lookup_shared_payment_context", { p_token_hash: tokenHash });
    const invoice = contextRows?.[0];
    const snapshot = (attempt.quote_snapshot as Record<string, unknown> | null) ?? {};
    const expectedInvoiceAmount = invoice ? (BigInt(invoice.amount_minor) * 10_000n).toString() : "";
    // The invoice and immutable attempt snapshot are authority. A later edit to
    // the business profile must not rewrite or invalidate an already quoted payee.
    if (!invoice || typeof attempt.recipient_address !== "string"
      || typeof attempt.expected_received_amount !== "string") {
      return NextResponse.json({ error: "attempt_invoice_snapshot_mismatch" }, { status: 409 });
    }
    let payer: string;
    try {
      payer = verifyImmutableAttemptInvoiceBinding({
        invoiceId: invoice.invoice_id,
        attemptInvoiceId: attempt.invoice_id,
        snapshot,
        invoiceAmountMinor: String(invoice.amount_minor),
        invoiceCurrency: invoice.currency,
        expectedInvoiceAmountBaseUnits: expectedInvoiceAmount,
        attemptExpectedReceivedAmount: attempt.expected_received_amount,
        attemptRecipient: attempt.recipient_address,
        attemptDestinationNetwork: attempt.destination_network,
        attemptDestinationAssetId: attempt.destination_asset_id,
        attemptSourceNetwork: attempt.source_network,
        attemptSourceAssetId: attempt.source_asset_id,
      });
    } catch {
      return NextResponse.json({ error: "attempt_invoice_snapshot_mismatch" }, { status: 409 });
    }
    if (!["open", "overdue"].includes(invoice.invoice_status)) {
      await saveRecovery(supabaseAdmin, id, "MANUAL_REVIEW");
      return NextResponse.json({ attempt: publicAttempt(attempt), pending: true, recoveryRequired: true });
    }

    const status = attempt.status;
    if (status === "SUCCESS" || status === "REFUNDED" || status === "FAILED" || status === "INCOMPLETE_DEPOSIT") {
      const { data: receipts } = await supabaseAdmin.rpc("lookup_shared_payment_receipts", { p_token_hash: tokenHash });
      return NextResponse.json({ attempt: publicAttempt(attempt), receipts: receipts ?? [], settled: status === "SUCCESS" });
    }

    if (status === "PENDING_DEPOSIT" && !attempt.transaction_hash && !attempt.circle_execution_reserved_at) {
      const expiresAt = attempt.quote_expires_at ? Date.parse(attempt.quote_expires_at) : Number.NaN;
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        await supabaseAdmin.rpc("update_live_attempt_status", {
          p_token_hash: tokenHash, p_attempt_id: id, p_status: "QUOTE_EXPIRED",
        });
        return NextResponse.json({ attempt: publicAttempt({ ...attempt, status: "QUOTE_EXPIRED" }), expired: true });
      }
      return NextResponse.json({ attempt: publicAttempt(attempt), pending: true });
    }

    const sourceTxHash = attempt.transaction_hash as string | null;
    if (!sourceTxHash && status === "PROCESSING") {
      const hasApproval = Boolean(attempt.circle_approval_tx_hash);
      const recoveryState = hasApproval ? "APPROVAL_CONFIRMED" : "AWAITING_SOURCE_BURN";
      return NextResponse.json({
        attempt: publicAttempt({ ...attempt, circle_recovery_state: attempt.circle_recovery_state }),
        pending: true,
        recoveryRequired: false,
        recoveryState,
        sourceTransactionReferenceMissing: true,
        executionStep: hasApproval ? "AWAITING_SOURCE_BURN" : "AWAITING_AUTHORIZATION",
        providerProgress: {
          provider: snapshot.type === "circle_cctp" ? "circle_cctp" : "circle_direct",
          message: hasApproval
            ? "USDC approval confirmed on Base Sepolia. Ready to authorize transfer."
            : "Payment reserved. Ready for wallet authorization.",
        },
      });
    }
    if (!sourceTxHash) {
      return NextResponse.json({ attempt: publicAttempt(attempt), pending: true, recoveryState: "AWAITING_SOURCE_BURN" });
    }

    if (snapshot.type === "circle_direct") {
      const isSameChain = attempt.source_network === attempt.destination_network;
      const circleInfo = getCircleChain(attempt.destination_network, true)
        ?? getCircleChain(attempt.destination_network, false);
      if (!circleInfo || !isSameChain) {
        return NextResponse.json({ attempt: publicAttempt(attempt), pending: true });
      }
      try {
        const proof = await verifyEvmDestinationTransfers({
          network: attempt.destination_network,
          contractAddress: circleInfo.usdcAddress,
          recipient: attempt.recipient_address,
          amount: attempt.expected_received_amount,
          transactionHashes: [sourceTxHash],
          assetId: attempt.destination_asset_id,
        });
        if (!proof.verified || !proof.finalityConfirmed) {
          return NextResponse.json({
            attempt: publicAttempt(attempt),
            pending: true,
            waitingForFinality: !proof.finalityConfirmed,
          });
        }
        const receivedMinor = assetUnitsToInvoiceMinor(proof.amount, 6);
        if (receivedMinor === null) return NextResponse.json({ attempt: publicAttempt(attempt), pending: true });
        const { data: recResult, error: recError } = await supabaseAdmin.rpc("record_payment_reconciliation", {
          p_attempt_id: id,
          p_provider_status: "SUCCESS",
          p_provider_signature_verified: true,
          p_chain_transfer_verified: true,
          p_destination_asset_id: attempt.destination_asset_id,
          p_destination_network: attempt.destination_network,
          p_recipient_address: attempt.recipient_address,
          p_received_amount_base_units: proof.amount,
          p_received_asset_decimals: 6,
          p_received_value_invoice_minor: receivedMinor,
          p_destination_tx_hashes: [sourceTxHash],
          p_evidence: { proof, verifiedAt: new Date().toISOString() },
        });
        if (recError || !recResult) return NextResponse.json({ attempt: publicAttempt(attempt), pending: true });
        const { data: receipts } = await supabaseAdmin.rpc("lookup_shared_payment_receipts", { p_token_hash: tokenHash });
        return NextResponse.json({
          attempt: publicAttempt({ ...attempt, status: "SUCCESS" }),
          settled: true,
          reconciliation: recResult,
          receipts: receipts ?? [],
        });
      } catch (directErr) {
        if (isPendingOrTransientError(directErr)) {
          return NextResponse.json({ attempt: publicAttempt(attempt), pending: true, verifying: true });
        }
        await saveRecovery(supabaseAdmin, id, "MANUAL_REVIEW");
        return NextResponse.json({
          attempt: publicAttempt({ ...attempt, circle_recovery_state: "MANUAL_REVIEW" }),
          pending: true,
          recoveryRequired: true,
        });
      }
    }

    if (snapshot.type !== "circle_cctp") return NextResponse.json({ attempt: publicAttempt(attempt), pending: true });

    const cctp = await fetchCircleCctpStatus({
      sourceNetwork: attempt.source_network,
      sourceTxHash,
      destinationNetwork: attempt.destination_network,
      isTestnet: true,
    });
    if (!cctp.message || cctp.cctpVersion !== 2) {
      const isIrisTransient = cctp.status === "pending" || isPendingOrTransientError(cctp.error);
      const isTerminalFailed = !isIrisTransient && (cctp.status === "failed" || cctp.forwardState === "FAILED");
      const dbState = isTerminalFailed ? "MANUAL_REVIEW" : "AWAITING_IRIS";
      const recoveryState = isTerminalFailed ? "MANUAL_INVESTIGATION_REQUIRED" : "AWAITING_CIRCLE_ATTESTATION";
      await saveRecovery(supabaseAdmin, id, dbState);
      await supabaseAdmin.rpc("update_live_attempt_status", {
        p_token_hash: tokenHash, p_attempt_id: id, p_status: "PROCESSING",
      });
      return NextResponse.json({
        attempt: publicAttempt({ ...attempt, status: "PROCESSING", circle_recovery_state: dbState }),
        pending: true,
        recoveryRequired: isTerminalFailed,
        recoveryState,
        executionStep: "AWAITING_CIRCLE_ATTESTATION",
        failureCode: isTerminalFailed ? (cctp.error ?? "cctp_attestation_failed") : undefined,
        providerProgress: {
          provider: "circle_cctp",
          forwardState: cctp.forwardState,
          message: isTerminalFailed
            ? "Circle cross-chain execution failed and requires manual review."
            : "Waiting for Circle CCTP V2 message attestation.",
        },
      });
    }

    const expectedBurnAmount = usdcToUnits(snapshot.amountReceived);
    const expectedSourceDebitAmount = usdcToUnits(snapshot.totalDebit);
    if (!expectedBurnAmount || expectedBurnAmount !== attempt.expected_received_amount
      || !expectedSourceDebitAmount || expectedSourceDebitAmount !== attempt.requested_amount) {
      await saveRecovery(supabaseAdmin, id, "MANUAL_REVIEW");
      return NextResponse.json({
        attempt: publicAttempt(attempt),
        pending: true,
        recoveryRequired: true,
        recoveryState: "MANUAL_INVESTIGATION_REQUIRED",
        failureCode: "attempt_amount_mismatch",
      });
    }

    try {
      const sourceProof = await verifyCctpV2SourceTransaction({
        sourceNetwork: attempt.source_network,
        sourceTxHash,
        payer,
        destinationNetwork: attempt.destination_network,
        expectedBurnAmount,
        expectedSourceDebitAmount,
        merchantRecipient: attempt.recipient_address,
        attestedMessage: cctp.message,
      });
      if (cctp.eventNonce !== undefined) {
        let irisNonce: bigint;
        try { irisNonce = BigInt(cctp.eventNonce); } catch { throw new Error("iris_nonce_malformed"); }
        if (irisNonce !== BigInt(sourceProof.nonce)) throw new Error("iris_cctp_nonce_mismatch");
      }
      await saveRecovery(supabaseAdmin, id, "SOURCE_VERIFIED", {
        nonce: sourceProof.nonce,
        messageHash: sourceProof.messageHash,
      });

      const destinationHashes = [...new Set([cctp.destinationMintTxHash, cctp.destinationTxHash]
        .filter((hash): hash is string => Boolean(hash)))];
      if (destinationHashes.length === 0) {
        await saveRecovery(supabaseAdmin, id, "AWAITING_DESTINATION", {
          nonce: sourceProof.nonce, messageHash: sourceProof.messageHash,
        });
        await supabaseAdmin.rpc("update_live_attempt_status", {
          p_token_hash: tokenHash, p_attempt_id: id, p_status: "PROCESSING",
        });
        return NextResponse.json({
          attempt: publicAttempt({ ...attempt, status: "PROCESSING", circle_recovery_state: "AWAITING_DESTINATION" }),
          pending: true,
          recoveryRequired: false,
          recoveryState: "AWAITING_DESTINATION_EXECUTION",
          executionStep: "AWAITING_DESTINATION_EXECUTION",
          providerProgress: {
            provider: "circle_cctp",
            forwardState: cctp.forwardState,
            message: "Source burn verified. Circle Orbit forwarder is executing destination transfer.",
          },
        });
      }

      const destinationProof = await verifyCctpV2DestinationTransaction({
        destinationNetwork: attempt.destination_network,
        destinationTxHashes: destinationHashes,
        sourceNetwork: attempt.source_network,
        source: sourceProof,
        recipient: attempt.recipient_address,
        minimumReceived: attempt.expected_received_amount,
        assetId: attempt.destination_asset_id,
      });
      await saveRecovery(supabaseAdmin, id, destinationProof.finalityConfirmed ? "DESTINATION_VERIFIED" : "AWAITING_FINALITY", {
        nonce: sourceProof.nonce,
        messageHash: sourceProof.messageHash,
        destinationTxHashes: destinationProof.transactionHashes,
      });
      if (!destinationProof.finalityConfirmed) {
        return NextResponse.json({
          attempt: publicAttempt({ ...attempt, circle_recovery_state: "AWAITING_FINALITY" }),
          pending: true,
          waitingForFinality: true,
          recoveryRequired: false,
          recoveryState: "AWAITING_FINALITY",
          executionStep: "AWAITING_FINALITY",
          providerProgress: {
            provider: "circle_cctp",
            forwardState: cctp.forwardState,
            message: "Destination transfer delivered on Arbitrum Sepolia. Awaiting block confirmations.",
          },
        });
      }

      const receivedMinor = assetUnitsToInvoiceMinor(destinationProof.amount, 6);
      if (receivedMinor === null) throw new Error("destination_amount_conversion_failed");
      const { data: recResult, error: recError } = await supabaseAdmin.rpc("record_payment_reconciliation", {
        p_attempt_id: id,
        p_provider_status: "SUCCESS",
        p_provider_signature_verified: true,
        p_chain_transfer_verified: true,
        p_destination_asset_id: attempt.destination_asset_id,
        p_destination_network: attempt.destination_network,
        p_recipient_address: attempt.recipient_address,
        p_received_amount_base_units: destinationProof.amount,
        p_received_asset_decimals: 6,
        p_received_value_invoice_minor: receivedMinor,
        p_destination_tx_hashes: destinationProof.transactionHashes,
        p_evidence: {
          sourceProof: {
            sourceTransactionHash: sourceProof.sourceTransactionHash, payer: sourceProof.payer,
            sourceDomain: sourceProof.sourceDomain, nonce: sourceProof.nonce, messageHash: sourceProof.messageHash,
            sourceBlockNumber: sourceProof.sourceBlockNumber, sourceBlockHash: sourceProof.sourceBlockHash,
          },
          destinationProof,
          circleStatus: { forwardState: cctp.forwardState, cctpVersion: cctp.cctpVersion },
          verifiedAt: new Date().toISOString(),
        },
      });
      if (recError || !recResult) throw new Error(recError?.message ?? "payment_reconciliation_failed");
      // The verified reconciliation transaction and its DB trigger are authoritative.
      // A best-effort immediate drain lowers latency; scheduled drains recover outages.
      try { await processNearSettlementOutbox(5); } catch { /* PostgreSQL remains the source of truth. */ }
      await saveRecovery(supabaseAdmin, id, "SETTLED", {
        nonce: sourceProof.nonce, messageHash: sourceProof.messageHash,
        destinationTxHashes: destinationProof.transactionHashes,
      });
      const { data: receipts } = await supabaseAdmin.rpc("lookup_shared_payment_receipts", { p_token_hash: tokenHash });
      return NextResponse.json({
        attempt: publicAttempt({ ...attempt, status: "SUCCESS", circle_recovery_state: "SETTLED" }),
        settled: true,
        recoveryState: "DESTINATION_SETTLEMENT_VERIFIED",
        executionStep: "SETTLED",
        reconciliation: recResult,
        receipts: receipts ?? [],
      });
    } catch (error) {
      const { isTransient, isOperatorConfig, failureCode, sanitizedMessage } = classifyError(error);
      const isExplicitFailure = !isTransient && !isOperatorConfig && (cctp.forwardState === "FAILED" || cctp.status === "failed");
      const dbRecoveryState = isExplicitFailure || (!isTransient && !isOperatorConfig)
        ? "MANUAL_REVIEW"
        : "AWAITING_VERIFICATION";
      const apiRecoveryState = dbRecoveryState === "MANUAL_REVIEW"
        ? "MANUAL_INVESTIGATION_REQUIRED"
        : "RETRYABLE_PROVIDER_FAILURE";

      await saveRecovery(supabaseAdmin, id, dbRecoveryState);
      await supabaseAdmin.rpc("update_live_attempt_status", {
        p_token_hash: tokenHash, p_attempt_id: id, p_status: "PROCESSING",
      });
      return NextResponse.json({
        attempt: publicAttempt({ ...attempt, status: "PROCESSING", circle_recovery_state: dbRecoveryState }),
        pending: true,
        recoveryRequired: dbRecoveryState === "MANUAL_REVIEW",
        recoveryState: apiRecoveryState,
        verificationPending: true,
        failureCode,
        diagnosticInfo: {
          failureCode,
          reason: sanitizedMessage,
          isOperatorConfig,
          isTransient,
        },
        providerProgress: {
          provider: "circle_cctp",
          forwardState: cctp.forwardState,
          message: sanitizedMessage,
        },
      });
    }
  } catch {
    await supabaseAdmin.rpc("update_live_attempt_status", {
      p_token_hash: tokenHash, p_attempt_id: id, p_status: "PROCESSING",
    });
    return NextResponse.json({ attempt: { id, status: "PROCESSING" }, pending: true, verifying: true });
  }
}
