import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomUUID } from "node:crypto";
import { getCmsAdmin, createCmsServiceClient } from "@/lib/cms/admin";

export const dynamic = "force-dynamic";

function visitorHash(request: NextRequest) {
  const cookieName = "nodus_analytics";
  const existing = request.cookies.get(cookieName)?.value;
  const valid = !!existing && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing);
  const token = valid ? existing! : randomUUID();
  const secret = process.env.CMS_ANALYTICS_SECRET || process.env.WORKOS_COOKIE_PASSWORD || "";
  const hash = secret ? createHmac("sha256", secret).update(token).digest("hex") : "";
  return { token, hash, isNew: !valid };
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return new NextResponse(null, { status: 400 }); }
  const eventName = body.eventName === "cta_click" ? "cta_click" : body.eventName === "page_view" ? "page_view" : null;
  const path = typeof body.path === "string" ? body.path : "";
  const excludedPrefixes = ["/studio", "/control", "/dashboard", "/api", "/pay", "/login", "/register", "/auth", "/sign-in", "/sign-up", "/reset-password"];
  if (!eventName || !path.startsWith("/") || excludedPrefixes.some((prefix) => path === prefix || path.startsWith(prefix + "/")) || path.length > 500) {
    return new NextResponse(null, { status: 204 });
  }

  const { token, hash, isNew } = visitorHash(request);
  const referrer = typeof body.referrer === "string" ? body.referrer : "";
  let referrerHost: string | null = null;
  try { if (referrer) referrerHost = new URL(referrer).hostname.slice(0, 255); } catch { /* Ignore invalid referrers. */ }
  const ctaId = typeof body.ctaId === "string" ? body.ctaId.slice(0, 120) : null;

  const db = createCmsServiceClient();
  await db.from("cms_analytics_events").insert({
    event_id: randomUUID(), event_name: eventName, path, session_id: token, visitor_hash: hash, referrer_host: referrerHost, cta_id: ctaId,
  });

  const response = new NextResponse(null, { status: 204 });
  if (isNew) response.cookies.set("nodus_analytics", token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const admin = await getCmsAdmin();
  if (!admin) return new NextResponse(null, { status: 404 });

  const range = request.nextUrl.searchParams.get("range") === "7" ? 7 : 30;
  const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString();
  const db = createCmsServiceClient();
  const result = await db.from("cms_analytics_events")
    .select("event_name,path,visitor_hash,referrer_host,cta_id,created_at")
    .gte("created_at", since).order("created_at", { ascending: false }).limit(10000);
  if (result.error) return NextResponse.json({ error: "Analytics could not be loaded." }, { status: 500 });

  const events = result.data ?? [];
  const views = events.filter((event) => event.event_name === "page_view");
  const visitors = new Set(views.map((event) => event.visitor_hash)).size;
  const byPath = new Map<string, number>();
  const byReferrer = new Map<string, number>();
  const byDay = new Map<string, number>();
  const byCta = new Map<string, number>();
  for (const event of events) {
    if (event.event_name === "page_view") {
      byPath.set(event.path, (byPath.get(event.path) ?? 0) + 1);
      const day = event.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      if (event.referrer_host) byReferrer.set(event.referrer_host, (byReferrer.get(event.referrer_host) ?? 0) + 1);
    } else if (event.cta_id) byCta.set(event.cta_id, (byCta.get(event.cta_id) ?? 0) + 1);
  }
  const rank = (map: Map<string, number>) => [...map].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  return NextResponse.json({
    range, pageViews: views.length, uniqueVisitors: visitors,
    ctaClicks: events.filter((event) => event.event_name === "cta_click").length,
    topPages: rank(byPath), referrers: rank(byReferrer),
    daily: [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
    topCtas: rank(byCta),
  });
}
