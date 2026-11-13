import { createHash } from "node:crypto";
import { NextResponse } from "next/server.js";
import { getSupabaseAdminClient } from "../../../../../../../lib/supabase/admin.ts";
import { isServerSupabaseConfigured } from "../../../../../../../config/env.server.ts";

export const dynamic = "force-dynamic";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  if (!TOKEN_PATTERN.test(token) || !UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "attempt_unavailable" }, { status: 404 });
  }

  if (!isServerSupabaseConfigured()) {
    return NextResponse.json({ error: "server_not_configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request_body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request_body" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const rawTxHash = input.transactionHash == null ? "" : String(input.transactionHash).trim();
  const rawApprovalHash = input.approvalTransactionHash == null ? null : String(input.approvalTransactionHash).trim();

  const hasTxHash = rawTxHash !== "" && HASH_PATTERN.test(rawTxHash);
  const hasApprovalHash = rawApprovalHash !== null && HASH_PATTERN.test(rawApprovalHash);

  if ((rawTxHash !== "" && !hasTxHash) || (rawApprovalHash !== null && !hasApprovalHash) || (!hasTxHash && !hasApprovalHash)) {
    return NextResponse.json({ error: "invalid_transaction_hash" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");

  try {
    if (hasTxHash) {
      const { data: attemptRows, error: attemptError } = await supabaseAdmin.rpc("get_shared_live_attempt", {
        p_token_hash: tokenHash,
        p_attempt_id: id,
      });
      if (attemptError || !attemptRows?.length) {
        return NextResponse.json({ error: "attempt_unavailable" }, { status: 404 });
      }

      const quoteSnapshot = attemptRows[0].quote_snapshot as Record<string, unknown> | null;
      const isDirectRoute = quoteSnapshot?.type === "circle_direct";
      const isCctpRoute = quoteSnapshot?.type === "circle_cctp";
      if (!isDirectRoute && !isCctpRoute) {
        return NextResponse.json({ error: "attempt_unavailable" }, { status: 404 });
      }

      const { data, error } = await supabaseAdmin.rpc(
        isDirectRoute ? "submit_circle_direct_broadcast_reference" : "submit_circle_broadcast_references",
        {
          p_token_hash: tokenHash,
          p_attempt_id: id,
          p_source_tx_hash: rawTxHash,
          p_approval_tx_hash: hasApprovalHash ? rawApprovalHash : null,
        },
      );

      if (error || !data?.[0]) {
        return NextResponse.json({ error: error?.message || "failed_to_update_attempt" }, { status: 409 });
      }

      const publicAttempt = { ...data[0] } as Record<string, unknown>;
      delete publicAttempt.quote_snapshot;

      return NextResponse.json({
        success: true,
        attempt: publicAttempt,
        recoveryState: "SOURCE_BURN_CONFIRMED",
      });
    }

    // Approval-only persistence before source burn broadcast
    const { data: attemptRows, error: fetchErr } = await supabaseAdmin.rpc("get_shared_live_attempt", {
      p_token_hash: tokenHash,
      p_attempt_id: id,
    });
    if (fetchErr || !attemptRows?.length) {
      return NextResponse.json({ error: "attempt_unavailable" }, { status: 404 });
    }
    const currentAttempt = attemptRows[0];
    if (currentAttempt.circle_approval_tx_hash
      && currentAttempt.circle_approval_tx_hash.toLowerCase() !== rawApprovalHash!.toLowerCase()) {
      return NextResponse.json({ error: "approval_reference_already_recorded" }, { status: 409 });
    }

    const { data: updateData, error: updateErr } = await supabaseAdmin
      .from("payment_attempts")
      .update({
        circle_approval_tx_hash: rawApprovalHash,
        circle_recovery_updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("mode", "live")
      .select("*");

    if (updateErr || !updateData?.[0]) {
      return NextResponse.json({ error: updateErr?.message || "failed_to_update_attempt" }, { status: 409 });
    }

    const publicAttempt = { ...updateData[0] } as Record<string, unknown>;
    delete publicAttempt.quote_snapshot;

    return NextResponse.json({
      success: true,
      attempt: publicAttempt,
      recoveryState: "APPROVAL_CONFIRMED",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
