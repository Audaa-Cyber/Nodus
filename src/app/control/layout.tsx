import Link from "next/link";
import { Activity, BarChart3, FileText, Settings2, Shield, Users } from "lucide-react";
import { requireControlContext } from "@/lib/control/access";
import "./control.css";

const navItems = [
  { href: "/control", label: "Overview", icon: BarChart3 },
  { href: "/control/content", label: "Website content", icon: FileText },
  { href: "/control/team", label: "Access & roles", icon: Users },
  { href: "/control/activity", label: "Audit activity", icon: Activity },
  { href: "/control/settings", label: "System settings", icon: Settings2 },
];

export const metadata = {
  title: "Nodus Control",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ControlLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await requireControlContext();
  const initials = (context.user.firstName?.[0] ?? context.user.email[0] ?? "N").toUpperCase();

  return (
    <div className="control-root">
      <div className="control-shell">
        <aside className="control-sidebar">
          <Link href="/control" className="control-brand" aria-label="Nodus Control home">
            <span className="control-brand-mark">n</span>
            <span>nodus<span className="control-brand-dot">.</span> control</span>
          </Link>
          <p className="control-side-label">CONTROL ROOM</p>
          <nav className="control-nav" aria-label="Control navigation">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <Icon aria-hidden="true" />{label}
              </Link>
            ))}
          </nav>
          <div className="control-sidebar-bottom">PRIVATE SYSTEM · {context.role.toUpperCase()}</div>
        </aside>
        <main className="control-main">
          <header className="control-topbar">
            <span className="control-breadcrumb">NODUS / CONTROL</span>
            <div className="control-user">
              <span>{context.user.email}</span>
              <span className="control-user-avatar">{initials}</span>
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
