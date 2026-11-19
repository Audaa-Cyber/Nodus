import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const siteOrigin = process.env.NEXT_PUBLIC_APP_URL;
  if (origin && siteOrigin && new URL(origin).origin !== new URL(siteOrigin).origin) {
    return new NextResponse(null, { status: 403 });
  }
  const target = new URL("/api/studio/analytics", request.url);
  const payload = await request.text();
  return fetch(target, { method: "POST", headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") ?? "" }, body: payload });
}
