import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED = new Set<Database["public"]["Enums"]["payment_attempt_status"]>([
  "QUOTE_EXPIRED", "PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS", "REFUNDED", "FAILED", "INCOMPLETE_DEPOSIT",
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!TOKEN_PATTERN.test(token) || !UUID_PATTERN.test(id)) return NextResponse.json({ error: "attempt_unavailable" }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
  const status = body && typeof body === "object" ? (body as Record<string, unknown>).status : null;
  if (typeof status !== "string" || !ALLOWED.has(status as Database["public"]["Enums"]["payment_attempt_status"])) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const { data, error } = await supabase.rpc("advance_mock_payment_attempt", {
    p_token_hash: tokenHash,
    p_attempt_id: id,
    p_next_status: status as Database["public"]["Enums"]["payment_attempt_status"],
  });
  if (error || !data?.[0]) return NextResponse.json({ error: "mock_transition_rejected" }, { status: 409 });
  return NextResponse.json({ simulated: true, attempt: data[0] }, { headers: { "Cache-Control": "no-store" } });
}
