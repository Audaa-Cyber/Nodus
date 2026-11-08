"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboardLoader } from "./dashboard-shell-effects";

interface NavItem {
  href: string;
  label: string;
  exact: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/invoices", label: "Invoices", exact: false },
  { href: "/dashboard/settings", label: "Business profile", exact: true },
];

export function DashboardNav() {
  const pathname = usePathname();
  const { triggerLoader } = useDashboardLoader();

  return (
    <nav className="space-y-1.5" aria-label="Sidebar Navigation">
      {NAV_ITEMS.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              if (!isActive) {
                triggerLoader(680);
              }
            }}
            className={`sidebar-link ${isActive ? "active" : ""}`}
          >
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
