import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processNearInvoiceRegistrationOutbox } from "@/lib/server/near-invoice-registration-outbox";

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
    return NextResponse.json(await processNearInvoiceRegistrationOutbox(10));
  } catch {
    return NextResponse.json({ error: "near_invoice_registration_unavailable" }, { status: 503 });
  }
}
