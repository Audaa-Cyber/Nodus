import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { getCmsAdmin, createCmsServiceClient } from "@/lib/cms/admin";

export const dynamic = "force-dynamic";

function visitorHash(request: NextRequest) {
  const cookieName = "nodus_analytics";
  const existing = request.cookies.get(cookieName)?.value;
  const token = existing && /^[a-f0-9-]{36}$/.test(existing) ? existing : randomBytes(18).toString("hex");
  const secret = process.env.CMS_ANALYTICS_SECRET || "";
  const hash = secret ? createHmac("sha256", secret).update(token).digest("hex") : createHash("sha256").update(token).digest("hex");
  return { token, hash, isNew: !existing };
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== request.nextUrl.origin) return new NextResponse(null, { status: 403 });
    } catch {
      return new NextResponse(null, { status: 403 });
    }
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) return new NextResponse(null, { status: 413 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new NextResponse(null, { status: 400 });
    body = parsed as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const eventName = body.eventName === "cta_click" ? "cta_click" : body.eventName === "page_view" ? "page_view" : null;
  const path = typeof body.path === "string" ? body.path : "";
  const excludedPrefixes = ["/studio", "/control", "/dashboard", "/api", "/pay", "/login", "/register", "/auth", "/sign-in", "/sign-up", "/reset-password"];
  if (!eventName || !path.startsWith("/") || path.includes("?") || path.includes("#") || excludedPrefixes.some((prefix) => path === prefix || path.startsWith(prefix + "/")) || path.length > 500) {
    return new NextResponse(null, { status: 204 });
  }

  const { token, hash, isNew } = visitorHash(request);
  const referrer = typeof body.referrer === "string" ? body.referrer : "";
  let referrerHost: string | null = null;
  try { if (referrer) referrerHost = new URL(referrer).hostname.slice(0, 255); } catch { /* Ignore invalid referrers. */ }
  const ctaId = typeof body.ctaId === "string" ? body.ctaId.slice(0, 120) : null;

  try {
    const db = createCmsServiceClient();
    const { error } = await db.from("cms_analytics_events").insert({
      event_name: eventName, path, visitor_hash: hash, referrer_host: referrerHost, cta_id: ctaId,
    });
    if (error) return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const response = new NextResponse(null, { status: 204 });
  if (isNew) response.cookies.set("nodus_analytics", token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export async function GET(request: NextRequest) {
  const admin = await getCmsAdmin();
  if (!admin) return new NextResponse(null, { status: 404 });

  const range = request.nextUrl.searchParams.get("range") === "7" ? 7 : 30;
  const now = Date.now();
  const currentStart = new Date(now - range * 24 * 60 * 60 * 1000);
  const previousStart = new Date(now - range * 2 * 24 * 60 * 60 * 1000);
  const db = createCmsServiceClient();

  const eventResult = await db.from("cms_analytics_events")
    .select("event_name,path,visitor_hash,referrer_host,cta_id,created_at")
    .gte("created_at", previousStart.toISOString()).order("created_at", { ascending: false }).limit(20000);
  if (eventResult.error) return NextResponse.json({ error: "Analytics could not be loaded." }, { status: 500 });

  const allEvents = eventResult.data ?? [];
  const events = allEvents.filter((event) => new Date(event.created_at) >= currentStart);
  const previousEvents = allEvents.filter((event) => new Date(event.created_at) < currentStart);
  const views = events.filter((event) => event.event_name === "page_view");
  const previousViews = previousEvents.filter((event) => event.event_name === "page_view");
  const currentVisitors = new Set(views.map((event) => event.visitor_hash)).size;
  const previousVisitors = new Set(previousViews.map((event) => event.visitor_hash)).size;
  const currentCtaClicks = events.filter((event) => event.event_name === "cta_click").length;
  const previousCtaClicks = previousEvents.filter((event) => event.event_name === "cta_click").length;

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
    range,
    pageViews: views.length,
    uniqueVisitors: currentVisitors,
    ctaClicks: currentCtaClicks,
    previous: { pageViews: previousViews.length, uniqueVisitors: previousVisitors, ctaClicks: previousCtaClicks },
    trends: {
      pageViews: percentageChange(views.length, previousViews.length),
      uniqueVisitors: percentageChange(currentVisitors, previousVisitors),
      ctaClicks: percentageChange(currentCtaClicks, previousCtaClicks),
    },
    topPages: rank(byPath),
    referrers: rank(byReferrer),
    daily: [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
    topCtas: rank(byCta),
  });
}
