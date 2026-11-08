import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ASSET_PATTERN = /^[A-Za-z0-9:_./-]{1,240}$/;

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) return NextResponse.json({ error: "invoice_unavailable" }, { status: 404 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 2048) return NextResponse.json({ error: "request_too_large" }, { status: 413 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (typeof input.idempotencyKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.idempotencyKey)
    || typeof input.sourceAssetId !== "string" || !ASSET_PATTERN.test(input.sourceAssetId)
    || typeof input.sourceNetwork !== "string" || !/^[a-z0-9:_-]{1,64}$/.test(input.sourceNetwork)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const { data, error } = await supabase.rpc("create_mock_payment_attempt", {
    p_token_hash: tokenHash,
    p_idempotency_key: input.idempotencyKey,
    p_source_asset_id: input.sourceAssetId,
    p_source_network: input.sourceNetwork,
  });
  if (error || !data?.[0]) return NextResponse.json({ error: "mock_attempt_unavailable" }, { status: 409 });
  return NextResponse.json({ simulated: true, attempt: data[0] }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
