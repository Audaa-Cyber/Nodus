import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isServerSupabaseConfigured } from "@/config/env.server";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: "invoice_unavailable" }, { status: 404 });
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
  const idempotencyKey = String(input.idempotencyKey ?? "").trim();
  const sourceAssetId = String(input.sourceAssetId ?? "").trim();
  const sourceNetwork = String(input.sourceNetwork ?? "").trim();
  const destinationAssetId = String(input.destinationAssetId ?? "").trim();
  const destinationNetwork = String(input.destinationNetwork ?? "").trim();
  const recipientAddress = String(input.recipientAddress ?? "").trim();
  const depositAddress = String(input.depositAddress ?? "").trim();
  const depositMemo = typeof input.depositMemo === "string" ? input.depositMemo : null;
  const requestedAmount = String(input.requestedAmount ?? "").trim();
  const expectedReceivedAmount = String(input.expectedReceivedAmount ?? "").trim();
  const quoteExpiresAt = String(input.quoteExpiresAt ?? "").trim();
  const quoteSnapshot = input.quoteSnapshot && typeof input.quoteSnapshot === "object" ? input.quoteSnapshot : null;

  if (
    !UUID_PATTERN.test(idempotencyKey) ||
    !sourceAssetId ||
    !sourceNetwork ||
    !destinationAssetId ||
    !destinationNetwork ||
    !recipientAddress ||
    !depositAddress ||
    !/^[0-9]+$/.test(requestedAmount) ||
    !/^[0-9]+$/.test(expectedReceivedAmount) ||
    !quoteExpiresAt ||
    !quoteSnapshot
  ) {
    return NextResponse.json({ error: "invalid_attempt_parameters" }, { status: 400 });
  }

  // Pre-authorization check: Ensure quote is not expired
  const expiresAtMs = Date.parse(quoteExpiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return NextResponse.json({ error: "quote_expired" }, { status: 410 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");

  try {
    const { data, error } = await supabaseAdmin.rpc("create_committed_payment_attempt", {
      p_token_hash: tokenHash,
      p_idempotency_key: idempotencyKey,
      p_source_asset_id: sourceAssetId,
      p_source_network: sourceNetwork,
      p_destination_asset_id: destinationAssetId,
      p_destination_network: destinationNetwork,
      p_recipient_address: recipientAddress,
      p_requested_amount: requestedAmount,
      p_expected_received_amount: expectedReceivedAmount,
      p_deposit_address: depositAddress,
      p_deposit_memo: depositMemo,
      p_quote_expires_at: quoteExpiresAt,
      p_quote_snapshot: quoteSnapshot as unknown as Json,
    });

    if (error) {
      if (error.message.includes("active_payment_attempt_exists")) {
        return NextResponse.json({ error: "active_payment_attempt_exists" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message || "failed_to_create_attempt" }, { status: 409 });
    }

    const createdAttempt = data?.[0];
    if (!createdAttempt) {
      return NextResponse.json({ error: "failed_to_create_attempt" }, { status: 409 });
    }

    return NextResponse.json(
      {
        success: true,
        attempt: createdAttempt,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
