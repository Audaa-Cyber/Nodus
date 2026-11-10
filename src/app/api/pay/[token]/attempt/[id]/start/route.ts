import { createHash } from "node:crypto";
import { NextResponse } from "next/server.js";
import { getSupabaseAdminClient } from "../../../../../../../lib/supabase/admin.ts";
import { isServerSupabaseConfigured } from "../../../../../../../config/env.server.ts";

export const dynamic = "force-dynamic";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!TOKEN_PATTERN.test(token) || !UUID_PATTERN.test(id)) {
    return errorResponse("attempt_unavailable", 404);
  }
  if (!isServerSupabaseConfigured()) {
    return errorResponse("server_not_configured", 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_request_body", 400);
  }
  const expectedPayer = body && typeof body === "object"
    ? String((body as Record<string, unknown>).expectedPayer ?? "").trim()
    : "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(expectedPayer)) {
    return errorResponse("invalid_expected_payer", 400);
  }

  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  try {
    const { data, error } = await getSupabaseAdminClient().rpc("mark_circle_execution_started", {
      p_token_hash: tokenHash,
      p_attempt_id: id,
      p_expected_payer: expectedPayer.toLowerCase(),
    });
    if (error || !data?.[0]) {
      return errorResponse("execution_start_failed", 409);
    }
    const reservation = data[0] as Record<string, unknown>;
    const reservedAt = reservation.circle_execution_reserved_at;
    if (reservation.status !== "PROCESSING"
      || typeof reservedAt !== "string"
      || reservedAt.trim() === ""
      || !TIMESTAMP_PATTERN.test(reservedAt)
      || !Number.isFinite(Date.parse(reservedAt))) {
      return errorResponse("execution_reservation_not_confirmed", 409);
    }
    return NextResponse.json({
      success: true,
      attempt: {
        id,
        status: "PROCESSING",
        circle_execution_reserved_at: reservedAt,
      },
    }, { headers: NO_STORE_HEADERS });
  } catch {
    return errorResponse("execution_start_failed", 409);
  }
}
