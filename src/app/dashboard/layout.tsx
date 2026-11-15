import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getBusinessContext, getVerifiedUser } from "@/lib/auth/business-context";
import { LogoutButton } from "@/components/logout-button";
import { DashboardNav } from "@/components/dashboard-nav";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { DashboardShellEffects } from "@/components/dashboard-shell-effects";
import { DashboardHeader } from "@/components/dashboard-header";
import { InvoiceRealtimeProvider } from "@/components/invoice-realtime-provider";

async function SidebarBusiness() {
  const { business } = await getBusinessContext();
  return (
    <div className="workspace-switcher">
      <span className="workspace-avatar" aria-hidden="true">{(business?.business_name ?? "W").trim().charAt(0).toUpperCase()}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold truncate text-slate-900">{business?.business_name ?? "Workspace"}</span>
        <span className="block text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Business workspace</span>
      </span>
      <span className="workspace-status" title="Workspace active" />
    </div>
  );
}

function SidebarBusinessFallback() {
  return <div className="workspace-switcher"><span className="workspace-avatar">…</span><span className="text-sm text-slate-400">Loading workspace</span></div>;
}

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/dashboard");
  const { business } = await getBusinessContext();

  return (
    <div className="dashboard-executive bg-grid selection:bg-slate-800 selection:text-white min-h-screen relative overflow-x-clip">
      <DashboardShellEffects>
        <div className="dashboard-app-shell relative z-10 min-h-screen">
          <DashboardSidebar>
          <aside className="nodus-sidebar select-none" aria-label="Main sidebar">
            <div className="sidebar-top">
              <Link href="/dashboard" className="sidebar-brand" aria-label="Nodus dashboard">
                <Image src="/logo.svg" alt="" width={331} height={213} style={{ height: "30px", width: "auto", display: "inline-block" }} aria-hidden="true" />
                <span>nodus<span className="brand-dot">.</span></span>
              </Link>
              <div className="sidebar-section-label">YOUR WORKSPACE</div>
              <Suspense fallback={<SidebarBusinessFallback />}>
                <SidebarBusiness />
              </Suspense>
              <DashboardNav />
            </div>
            <div className="sidebar-account">
              <div className="account-identity">
                <span className="account-avatar" aria-hidden="true">{(user.email ?? "U").trim().charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-800">Your account</span>
                  <span className="block text-[11px] truncate mt-0.5" style={{ color: "var(--text-muted)" }}>{user.email}</span>
                </span>
              </div>
              <div className="sidebar-logout"><LogoutButton /></div>
            </div>
          </aside>
          </DashboardSidebar>
          <main className="dashboard-main min-w-0">
            <InvoiceRealtimeProvider businessId={business?.id}>
              <div className="dashboard-content">
                <DashboardHeader recipientUserId={user.id} userEmail={user.email} />
                {children}
              </div>
            </InvoiceRealtimeProvider>
          </main>
        </div>
      </DashboardShellEffects>
    </div>
  );
}
