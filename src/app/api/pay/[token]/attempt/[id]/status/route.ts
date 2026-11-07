import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { allowOneClickRequest, assertLivePaymentsEnabled, getOneClickExecutionStatus } from "@/lib/server/one-click";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!TOKEN.test(token) || !UUID.test(id)) return NextResponse.json({ error: "attempt_unavailable" }, { status: 404 });
  if (!allowOneClickRequest(`status:${id}`, 20, 60_000)) return NextResponse.json({ error: "status_rate_limit" }, { status: 429 });
  try { assertLivePaymentsEnabled(); } catch { return NextResponse.json({ error: "live_payments_disabled" }, { status: 503 }); }
  const supabase = getSupabaseAdminClient();
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const { data: rows, error } = await supabase.rpc("get_shared_live_attempt", { p_token_hash: tokenHash, p_attempt_id: id });
  const attempt = rows?.[0];
  if (error || !attempt?.deposit_address) return NextResponse.json({ error: "attempt_unavailable" }, { status: 404 });
  try {
    const execution = await getOneClickExecutionStatus(attempt.deposit_address, attempt.deposit_memo ?? undefined);
    const { data: saved, error: updateError } = await supabase.rpc("update_live_attempt_status", {
      p_token_hash: tokenHash,
      p_attempt_id: id,
      p_status: execution.status as Database["public"]["Enums"]["payment_attempt_status"],
      p_transaction_hash: null,
    });
    if (updateError || !saved?.[0]) return NextResponse.json({ error: "status_update_failed" }, { status: 503 });
    return NextResponse.json({ mode: "live", attempt: saved[0], execution }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "execution_status_unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!TOKEN.test(token) || !UUID.test(id)) return NextResponse.json({ error: "attempt_unavailable" }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
  const status = body && typeof body === "object" ? (body as Record<string, unknown>).status : null;
  if (status !== "FAILED" && status !== "QUOTE_EXPIRED") return NextResponse.json({ error: "invalid_close_status" }, { status: 400 });
  try { assertLivePaymentsEnabled(); } catch { return NextResponse.json({ error: "live_payments_disabled" }, { status: 503 }); }
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("close_live_attempt", {
    p_token_hash: tokenHash,
    p_attempt_id: id,
    p_status: status as Database["public"]["Enums"]["payment_attempt_status"],
  });
  if (error || !data?.[0]) return NextResponse.json({ error: "attempt_close_rejected" }, { status: 409 });
  return NextResponse.json({ attempt: data[0] }, { headers: { "Cache-Control": "no-store" } });
}
