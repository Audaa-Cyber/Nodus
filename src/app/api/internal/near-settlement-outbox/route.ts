import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processNearSettlementOutbox } from "@/lib/server/near-settlement-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.NEAR_OUTBOX_WORKER_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !supplied) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await processNearSettlementOutbox(10));
  } catch {
    return NextResponse.json({ error: "near_outbox_unavailable" }, { status: 503 });
  }
}
