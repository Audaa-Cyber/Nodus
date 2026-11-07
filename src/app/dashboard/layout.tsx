import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getBusinessContext, getVerifiedUser } from "@/lib/auth/business-context";
import { LogoutButton } from "@/components/logout-button";
import { DashboardNav } from "@/components/dashboard-nav";

// Streams the sidebar shell immediately and fills in the business name as soon as
// the (60s-cached) business_profiles query resolves, so a cold profile fetch never
// blocks the whole dashboard tree.
async function SidebarBusiness() {
  const { business } = await getBusinessContext();
  return (
    <div className="sidebar-business">
      <span className="sidebar-label">BUSINESS</span>
      <strong>{business?.business_name ?? "Business profile"}</strong>
    </div>
  );
}

function SidebarBusinessFallback() {
  return (
    <div className="sidebar-business">
      <span className="sidebar-label">BUSINESS</span>
      <strong aria-hidden="true">&nbsp;</strong>
    </div>
  );
}

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Gate on the fast, header-derived user (no profile query) so the shell and nav
  // paint immediately; the profile is resolved lazily inside Suspense below.
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/dashboard");
  return <div className="dashboard-shell">
    <aside className="dashboard-sidebar">
      <Link href="/" className="brand"><span className="brand-mark">n</span><span>nodus<span className="brand-period">.</span></span></Link>
      <Suspense fallback={<SidebarBusinessFallback />}>
        <SidebarBusiness />
      </Suspense>
      <DashboardNav />
      <div className="sidebar-bottom"><span className="sidebar-email">{user.email}</span><LogoutButton /></div>
    </aside>
    <div className="dashboard-main">{children}</div>
  </div>;
}
