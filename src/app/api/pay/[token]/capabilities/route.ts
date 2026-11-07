import { NextResponse } from "next/server";
import { assertLivePaymentsEnabled } from "@/lib/server/one-click";

export const dynamic = "force-dynamic";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return NextResponse.json({ error: "invoice_unavailable" }, { status: 404 });
  try {
    assertLivePaymentsEnabled();
    return NextResponse.json({ liveQuotesEnabled: true, liveExecutionEnabled: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ liveQuotesEnabled: false, liveExecutionEnabled: false }, { headers: { "Cache-Control": "no-store" } });
  }
}
