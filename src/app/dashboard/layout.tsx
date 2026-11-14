import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getBusinessContext, getVerifiedUser } from "@/lib/auth/business-context";
import { LogoutButton } from "@/components/logout-button";
import { DashboardNav } from "@/components/dashboard-nav";
import { DashboardShellEffects } from "@/components/dashboard-shell-effects";

async function SidebarBusiness() {
  const { business } = await getBusinessContext();
  return (
    <div className="flex items-center justify-between">
      <span id="sidebarBusinessName" className="text-sm font-semibold text-slate-900 truncate">
        {business?.business_name ?? "Workspace"}
      </span>
      <span className="w-2 h-2 rounded-full bg-emerald-500" title="Active Workspace" />
    </div>
  );
}

function SidebarBusinessFallback() {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-semibold text-slate-400 truncate animate-pulse">
        Loading...
      </span>
      <span className="w-2 h-2 rounded-full bg-slate-300" />
    </div>
  );
}

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/dashboard");

  return (
    <div className="dashboard-executive bg-grid selection:bg-slate-800 selection:text-white min-h-screen relative overflow-x-hidden">
      <DashboardShellEffects>
        <div className="relative z-10 min-h-screen flex flex-col md:flex-row">
          {/* Executive Left Sidebar */}
          <aside className="nodus-sidebar w-full md:w-[236px] shrink-0 flex flex-col justify-between p-5 select-none">
            <div>
              {/* Brand Logo: (n) nodus. */}
              <div className="flex items-center gap-2.5 mb-7 px-1">
                <Link href="/" className="inline-flex items-center gap-2.5">
                  <Image src="/logo.svg" alt="Nodus logo" width={331} height={213} style={{ height: "28px", width: "auto", display: "inline-block" }} aria-hidden="true" />
                  <span className="text-[17px] font-bold tracking-tight text-slate-900">
                    nodus<span className="text-slate-400">.</span>
                  </span>
                </Link>
              </div>

              {/* Business Workspace Block */}
              <div className="px-1 pb-5 mb-5 border-b" style={{ borderColor: "var(--card-border)" }}>
                <span className="block text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>
                  BUSINESS
                </span>
                <Suspense fallback={<SidebarBusinessFallback />}>
                  <SidebarBusiness />
                </Suspense>
              </div>

              {/* Navigation Menu (Overview, Invoices, Business profile) */}
              <DashboardNav />
            </div>

            {/* Bottom Account Footer (Email + Avatar + Log out) */}
            <div className="pt-4 mt-6 border-t" style={{ borderColor: "var(--card-border)" }}>
              <div className="px-1 mb-3">
                <span className="block text-[11px] font-mono-code truncate" style={{ color: "var(--text-secondary)" }}>
                  {user.email}
                </span>
              </div>
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2.5">
                  <Image src="/logo.svg" alt="Nodus logo" width={331} height={213} style={{ height: "28px", width: "auto", display: "inline-block" }} aria-hidden="true" />
                  <LogoutButton />
                </div>
              </div>
            </div>
          </aside>

          {/* Main Stage */}
          <main className="flex-1 flex flex-col items-center justify-start px-5 sm:px-10 py-8 sm:py-12 overflow-y-auto min-w-0">
            <div className="w-full max-w-[760px]">
              {children}
            </div>
          </main>
        </div>
      </DashboardShellEffects>
    </div>
  );
}
