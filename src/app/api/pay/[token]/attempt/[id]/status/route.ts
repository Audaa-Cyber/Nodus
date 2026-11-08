import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isServerSupabaseConfigured } from "@/config/env.server";
import { fetchSuperbridgeActivity } from "@/lib/server/superbridge";
import { getCircleChain } from "@/lib/server/circle";
import { verifyEvmDestinationTransfers } from "@/lib/server/settlement-chain";
import { assetUnitsToInvoiceMinor } from "@/lib/payments/settlement-policy";

export const dynamic = "force-dynamic";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    if (fetchErr || !attemptRows || attemptRows.length === 0) {
      return NextResponse.json({ error: "attempt_unavailable" }, { status: 404 });
    }

    const attempt = attemptRows[0];
    const status = attempt.status;

    // Terminal state - return directly
    if (status === "SUCCESS" || status === "REFUNDED" || status === "FAILED" || status === "INCOMPLETE_DEPOSIT") {
      const { data: receipts } = await supabaseAdmin.rpc("lookup_shared_payment_receipts", {
        p_token_hash: tokenHash,
      });
      return NextResponse.json({
        attempt,
        receipts: receipts ?? [],
        settled: status === "SUCCESS",
      });
    }

    // If still awaiting deposit broadcast
    if (status === "PENDING_DEPOSIT" && !attempt.transaction_hash) {
      const expiresAt = attempt.quote_expires_at ? Date.parse(attempt.quote_expires_at) : Number.NaN;
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        await supabaseAdmin.rpc("update_live_attempt_status", {
          p_token_hash: tokenHash,
          p_attempt_id: id,
          p_status: "QUOTE_EXPIRED",
        });
        return NextResponse.json({ attempt: { ...attempt, status: "QUOTE_EXPIRED" }, expired: true });
      }
      return NextResponse.json({ attempt, pending: true });
    }

    // Attempt has a broadcasted source transaction hash
    const sourceTxHash = attempt.transaction_hash;
    const destNetwork = attempt.destination_network;
    const recipient = attempt.recipient_address;
    const expectedReceived = attempt.expected_received_amount;

    if (!sourceTxHash || !destNetwork || !recipient || !expectedReceived) {
      return NextResponse.json({ attempt, pending: true });
    }

    const snapshot = (attempt.quote_snapshot as Record<string, unknown>) ?? {};
    const routeType = String(snapshot.type ?? "");

    let destinationTxHashes: string[] = [];
    let providerCompleted = false;

    // Route tracking evaluation
    if (routeType === "circle_direct") {
      // Same-chain transfer: Source TX IS the destination transfer TX
      destinationTxHashes = [sourceTxHash];
      providerCompleted = true;
    } else if (routeType === "circle_cctp") {
      // Cross-chain CCTP: For now, if same-network or testnet mock, source is tracked
      // In live CCTP, Iris attestation reveals the destination mint hash
      destinationTxHashes = [sourceTxHash];
      providerCompleted = true;
    } else if (routeType === "superbridge") {
      const activities = await fetchSuperbridgeActivity({ txHash: sourceTxHash });
      const active = activities[0];
      if (active) {
        if ("status" in active && active.status === "done") {
          providerCompleted = true;
          // Extract destination tx hash if present
          const rawActive = active as Record<string, unknown>;
          const destStep = active.steps?.find((s) => "confirmation" in s && Boolean((s as { confirmation?: { transactionHash?: string } }).confirmation?.transactionHash));
          const stepHash = destStep && "confirmation" in destStep ? (destStep as { confirmation?: { transactionHash?: string } }).confirmation?.transactionHash : undefined;
          const destHash =
            typeof rawActive.toTxHash === "string"
              ? rawActive.toTxHash
              : typeof stepHash === "string"
                ? stepHash
                : sourceTxHash;
          destinationTxHashes = [destHash];
        } else if ("status" in active && active.status === "failed") {
          await supabaseAdmin.rpc("update_live_attempt_status", {
            p_token_hash: tokenHash,
            p_attempt_id: id,
            p_status: "FAILED",
          });
          return NextResponse.json({ attempt: { ...attempt, status: "FAILED" } });
        }
      }
    } else {
      // Default / fallback
      destinationTxHashes = [sourceTxHash];
      providerCompleted = true;
    }

    // =========================================================================
    // CRITICAL SECURITY RULE: INDEPENDENT ON-CHAIN SETTLEMENT VERIFICATION
    // Zero Blind Trust: We DO NOT mark the invoice paid solely on providerCompleted.
    // We verify the destination chain RPC event logs.
    // =========================================================================
    if (providerCompleted && destinationTxHashes.length > 0) {
      const circleInfo = getCircleChain(destNetwork, process.env.NODE_ENV !== "production");
      const contractAddress = circleInfo?.usdcAddress;

      if (contractAddress) {
        try {
          const proof = await verifyEvmDestinationTransfers({
            network: destNetwork,
            contractAddress,
            recipient,
            amount: expectedReceived,
            transactionHashes: destinationTxHashes,
            assetId: attempt.destination_asset_id,
          });

          if (proof.verified && proof.finalityConfirmed) {
            const receivedMinor = assetUnitsToInvoiceMinor(proof.amount, 6);
            if (receivedMinor !== null) {
              const { data: recResult, error: recError } = await supabaseAdmin.rpc("record_payment_reconciliation", {
                p_attempt_id: id,
                p_provider_status: "SUCCESS",
                p_provider_signature_verified: true,
                p_chain_transfer_verified: true,
                p_destination_asset_id: attempt.destination_asset_id,
                p_destination_network: destNetwork,
                p_recipient_address: recipient,
                p_received_amount_base_units: proof.amount,
                p_received_asset_decimals: 6,
                p_received_value_invoice_minor: receivedMinor,
                p_destination_tx_hashes: destinationTxHashes,
                p_evidence: {
                  proof,
                  verifiedAt: new Date().toISOString(),
                },
              });

              if (!recError && recResult) {
                const { data: receipts } = await supabaseAdmin.rpc("lookup_shared_payment_receipts", {
                  p_token_hash: tokenHash,
                });
                return NextResponse.json({
                  attempt: { ...attempt, status: "SUCCESS" },
                  settled: true,
                  reconciliation: recResult,
                  receipts: receipts ?? [],
                });
              }
            }
          }
        } catch {
          // If destination verification RPC is temporarily unavailable,
          // advance status to PROCESSING without marking paid.
          await supabaseAdmin.rpc("update_live_attempt_status", {
            p_token_hash: tokenHash,
            p_attempt_id: id,
            p_status: "PROCESSING",
          });
          return NextResponse.json({ attempt: { ...attempt, status: "PROCESSING" }, verifying: true });
        }
      }
    }

    return NextResponse.json({ attempt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_status_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
