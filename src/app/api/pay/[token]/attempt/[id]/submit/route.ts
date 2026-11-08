import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isServerSupabaseConfigured } from "@/config/env.server";
import { indexSuperbridgeTransaction } from "@/lib/server/superbridge";

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
  const transactionHash = String(input.transactionHash ?? "").trim();
  const chainUid = typeof input.chainUid === "string" ? input.chainUid : undefined;

  if (!HASH_PATTERN.test(transactionHash)) {
    return NextResponse.json({ error: "invalid_transaction_hash" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");

  try {
    const { data, error } = await supabaseAdmin.rpc("update_live_attempt_status", {
      p_token_hash: tokenHash,
      p_attempt_id: id,
      p_status: "KNOWN_DEPOSIT_TX",
      p_transaction_hash: transactionHash,
    });

    if (error || !data?.[0]) {
      return NextResponse.json({ error: error?.message || "failed_to_update_attempt" }, { status: 409 });
    }

    // Optional Superbridge indexing notification
    if (chainUid) {
      void indexSuperbridgeTransaction({ chainUid, txHash: transactionHash });
    }

    return NextResponse.json({
      success: true,
      attempt: data[0],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
