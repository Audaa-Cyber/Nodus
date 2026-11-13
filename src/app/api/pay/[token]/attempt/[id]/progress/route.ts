import { createHash } from "node:crypto";
import { NextResponse } from "next/server.js";
import { isServerSupabaseConfigured } from "../../../../../../../config/env.server.ts";
import { getSupabaseAdminClient } from "../../../../../../../lib/supabase/admin.ts";
import { sanitizeCircleBridgeStep } from "../../../../../../../lib/payments/circle-bridge-recovery.ts";

export const dynamic = "force-dynamic";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!TOKEN_PATTERN.test(token) || !UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "attempt_unavailable" }, { status: 404, headers: NO_STORE });
  }
  if (!isServerSupabaseConfigured()) {
    return NextResponse.json({ error: "server_not_configured" }, { status: 503, headers: NO_STORE });
  }

  let input: unknown;
  try { input = await request.json(); } catch {
    return NextResponse.json({ error: "invalid_request_body" }, { status: 400, headers: NO_STORE });
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return NextResponse.json({ error: "invalid_request_body" }, { status: 400, headers: NO_STORE });
  }
  const body = input as Record<string, unknown>;
  const resultState = body.resultState;
  const step = body.step == null ? null : sanitizeCircleBridgeStep(body.step);
  if ((resultState !== "pending" && resultState !== "success" && resultState !== "error")
    || (body.step != null && !step)) {
    return NextResponse.json({ error: "invalid_circle_sdk_progress" }, { status: 400, headers: NO_STORE });
  }

  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  try {
    const { data, error } = await getSupabaseAdminClient().rpc("record_circle_sdk_progress", {
      p_token_hash: tokenHash,
      p_attempt_id: id,
      p_result_state: resultState,
      p_step: step,
    });
    if (error || !data?.[0]) {
      return NextResponse.json({ error: "circle_sdk_progress_unavailable" }, { status: 409, headers: NO_STORE });
    }
    return NextResponse.json({
      success: true,
      sourceBurnRecorded: typeof data[0].transaction_hash === "string",
    }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "circle_sdk_progress_unavailable" }, { status: 503, headers: NO_STORE });
  }
}
