import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server.js";
import { processNearSettlementOutbox } from "../../../../lib/server/near-settlement-outbox.ts";
import { createNearSettlementClient } from "../../../../lib/server/near-settlement-client.ts";
import { getSupabaseAdminClient } from "../../../../lib/supabase/admin.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.NEAR_OUTBOX_WORKER_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

/** Read-only worker readiness; never claims jobs or signs transactions. */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let stage = "outbox_read";
  try {
    const { data, error } = await getSupabaseAdminClient().from("near_settlement_outbox")
      .select("reconciliation_id,status,attempt_count").eq("status", "pending")
      .order("created_at").limit(1);
    if (error) throw new Error("near_outbox_read_failed");
    stage = "client_initialization";
    const near = createNearSettlementClient();
    stage = "near_readback";
    // Always await a view, including on an empty queue: client initialization
    // starts an asynchronous network check that must not be left unobserved.
    const record = await near.view("get_settlement", {
      reconciliation_id: data?.[0]?.reconciliation_id ?? "00000000-0000-0000-0000-000000000000",
    });
    return NextResponse.json({ ready: true, pendingJob: data?.[0] ?? null, recordPresent: Boolean(record) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = /^near_[a-z_]+$/.test(message) ? message : "near_worker_readiness_failed";
    // Do not expose raw SDK errors, credentials, RPC URLs, or signer material.
    return NextResponse.json({ ready: false, stage, error: code }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await processNearSettlementOutbox(10));
  } catch {
    return NextResponse.json({ error: "near_outbox_unavailable" }, { status: 503 });
  }
}
