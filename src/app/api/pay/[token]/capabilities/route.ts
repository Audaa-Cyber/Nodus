import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return NextResponse.json({ error: "invoice_unavailable" }, { status: 404 });

  const hasSuperbridge = Boolean(process.env.SUPERBRIDGE_API_KEY?.trim());
  const isMock = process.env.PAYMENT_MODE === "mock";

  return NextResponse.json(
    {
      liveQuotesEnabled: true,
      liveExecutionEnabled: hasSuperbridge || isMock,
      providers: ["circle", "superbridge"],
      mode: isMock ? "mock" : "live",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
