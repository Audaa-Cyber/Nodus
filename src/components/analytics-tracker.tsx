"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function AnalyticsTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const excludedPrefixes = ["/studio", "/control", "/dashboard", "/api", "/pay", "/login", "/register", "/auth", "/sign-in", "/sign-up", "/reset-password"];
    if (!pathname || excludedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"))) return;
    const send = (payload: Record<string,string>) => {
      void fetch("/api/studio/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify(payload),
      }).catch(() => undefined);
    };
    send({ eventName: "page_view", path: pathname, referrer: document.referrer });
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const cta = target.closest<HTMLElement>("[data-analytics-cta]");
      if (!cta) return;
      send({ eventName: "cta_click", path: pathname, ctaId: cta.dataset.analyticsCta || cta.textContent?.trim().slice(0, 80) || "unknown" });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [pathname]);
  return null;
}
