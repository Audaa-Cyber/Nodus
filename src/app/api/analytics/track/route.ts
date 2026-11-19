import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAnonymousServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXCLUDED_PREFIXES = ["/control", "/dashboard", "/api", "/pay", "/login", "/register", "/auth", "/sign-in", "/sign-up", "/reset-password"];

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const eventId = String(payload?.event_id ?? "");
    const sessionId = String(payload?.session_id ?? "");
    const path = String(payload?.path ?? "");
    const referrerHost = payload?.referrer_host ? String(payload.referrer_host).slice(0, 255) : null;

    if (!UUID_PATTERN.test(eventId) || !UUID_PATTERN.test(sessionId) || !path.startsWith("/") || path.length > 500 || path.includes("?") || path.includes("#")) {
      return NextResponse.json({ success: false }, { status: 400 });
    }
    if (EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + "/"))) {
      return NextResponse.json({ success: true, ignored: true }, { status: 202 });
    }

    const supabase = createSupabaseAnonymousServerClient() as any;
    const { error } = await supabase.from("cms_analytics_events").insert({
      event_id: eventId, event_name: "page_view", session_id: sessionId, path, referrer_host: referrerHost,
    });
    if (error) return NextResponse.json({ success: false }, { status: 202 });
    return NextResponse.json({ success: true }, { status: 202 });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
