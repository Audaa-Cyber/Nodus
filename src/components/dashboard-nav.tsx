"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  exact: boolean;
  icon: "overview" | "invoices" | "settings";
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Overview", exact: true, icon: "overview" },
  { href: "/dashboard/invoices", label: "Invoices", exact: false, icon: "invoices" },
  { href: "/dashboard/settings", label: "Business profile", exact: true, icon: "settings" },
];

function NavIcon({ name }: { name: NavItem["icon"] }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "overview") return <svg {...common}><rect x="3.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="3.5" width="7" height="4" rx="1.4" /><rect x="13.5" y="10.5" width="7" height="10" rx="1.4" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.4" /></svg>;
  if (name === "invoices") return <svg {...common}><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 16h6" /></svg>;
  return <svg {...common}><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.5-3.2 3.1-5.2 7-5.2s6.5 2 7 5.2" /><path d="M19 4.5h2M20 3.5v2" /></svg>;
}

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="dashboard-navigation" aria-label="Main navigation">
      <span className="sidebar-section-label nav-section-label">MENU</span>
      <div className="sidebar-nav-items">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} prefetch aria-current={isActive ? "page" : undefined} className={`sidebar-link ${isActive ? "active" : ""}`}>
              <span className="sidebar-link-icon"><NavIcon name={item.icon} /></span>
              <span className="sidebar-link-label">{item.label}</span>
              {isActive && <span className="sidebar-active-indicator" aria-hidden="true" />}
            </Link>
          );
        })}
      </div>
      <div className="sidebar-nav-note">
        <span className="sidebar-nav-note-mark" aria-hidden="true">N</span>
        <span><strong>Payments, in order.</strong></span>
      </div>
    </nav>
  );
}
