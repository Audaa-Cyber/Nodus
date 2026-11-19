"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const excluded = ["/control", "/dashboard", "/api", "/pay", "/login", "/register", "/auth", "/sign-in", "/sign-up", "/reset-password"];

function getSessionId() {
  const key = "nodus.analytics.session";
  let value = window.sessionStorage.getItem(key);
  if (!value) {
    value = window.crypto.randomUUID();
    window.sessionStorage.setItem(key, value);
  }
  return value;
}

export function PublicAnalyticsTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || excluded.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"))) return;
    const eventId = window.crypto.randomUUID();
    let referrerHost: string | null = null;
    try { referrerHost = document.referrer ? new URL(document.referrer).host : null; } catch { referrerHost = null; }
    void fetch("/api/analytics/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event_id: eventId, session_id: getSessionId(), path: pathname, referrer_host: referrerHost }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);
  return null;
}
