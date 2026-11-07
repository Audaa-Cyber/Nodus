import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertLivePaymentsEnabled, submitOneClickDepositTx } from "@/lib/server/one-click";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!TOKEN.test(token) || !UUID.test(id)) return NextResponse.json({ error: "attempt_unavailable" }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
  const txHash = body && typeof body === "object" ? (body as Record<string, unknown>).txHash : null;
  if (typeof txHash !== "string" || txHash.length > 128) return NextResponse.json({ error: "invalid_transaction_hash" }, { status: 400 });
  try { assertLivePaymentsEnabled(); } catch { return NextResponse.json({ error: "live_payments_disabled" }, { status: 503 }); }

  const supabase = getSupabaseAdminClient();
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const { data: rows, error } = await supabase.rpc("get_shared_live_attempt", { p_token_hash: tokenHash, p_attempt_id: id });
  const attempt = rows?.[0];
  if (error || !attempt?.deposit_address) return NextResponse.json({ error: "attempt_unavailable" }, { status: 404 });
  const evm = ["ethereum", "arbitrum", "base", "optimism", "polygon", "bsc", "avalanche"].includes(attempt.source_network);
  const solana = attempt.source_network === "solana";
  if ((evm && !/^0x[a-fA-F0-9]{64}$/.test(txHash)) || (solana && !/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(txHash)) || (!evm && !solana)) {
    return NextResponse.json({ error: "invalid_transaction_hash" }, { status: 400 });
  }
  try {
    const submission = await submitOneClickDepositTx(attempt.deposit_address, txHash);
    const { data: saved, error: updateError } = await supabase.rpc("update_live_attempt_status", {
      p_token_hash: tokenHash,
      p_attempt_id: id,
      p_status: "PENDING_DEPOSIT" as Database["public"]["Enums"]["payment_attempt_status"],
      p_transaction_hash: txHash,
    });
    if (updateError || !saved?.[0]) return NextResponse.json({ error: "deposit_submission_record_failed" }, { status: 503 });
    return NextResponse.json({ submitted: true, note: "Transaction hash submitted to 1Click; settlement is not verified.", attempt: saved[0], submission }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "deposit_submission_unavailable" }, { status: 503 });
  }
}
