import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isServerSupabaseConfigured } from "@/config/env.server";

export const dynamic = "force-dynamic";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!TOKEN_PATTERN.test(token) || !UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "attempt_unavailable" }, { status: 404 });
  }
  if (!isServerSupabaseConfigured()) {
    return NextResponse.json({ error: "server_not_configured" }, { status: 503 });
  }
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const { data, error } = await getSupabaseAdminClient().rpc("mark_circle_execution_started", {
    p_token_hash: tokenHash,
    p_attempt_id: id,
  });
  if (error || !data?.[0]) {
    return NextResponse.json({ error: error?.message ?? "execution_start_failed" }, { status: 409 });
  }
  const publicAttempt = { ...data[0] } as Record<string, unknown>;
  delete publicAttempt.quote_snapshot;
  return NextResponse.json({ success: true, attempt: publicAttempt }, { headers: { "Cache-Control": "no-store" } });
}
