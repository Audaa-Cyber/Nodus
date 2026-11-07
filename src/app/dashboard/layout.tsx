import Link from "next/link";
import { redirect } from "next/navigation";
import { getBusinessContext } from "@/lib/auth/business-context";
import { LogoutButton } from "@/components/logout-button";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user, business } = await getBusinessContext();
  if (!user) redirect("/login?next=/dashboard");
  return <div className="dashboard-shell">
    <aside className="dashboard-sidebar">
      <Link href="/" className="brand"><span className="brand-mark">n</span><span>nodus<span className="brand-period">.</span></span></Link>
      <div className="sidebar-business"><span className="sidebar-label">BUSINESS</span><strong>{business?.business_name ?? "Business profile"}</strong></div>
      <nav aria-label="Dashboard navigation"><Link href="/dashboard">Overview</Link><Link href="/dashboard/invoices">Invoices</Link><Link href="/dashboard/settings">Business profile</Link></nav>
      <div className="sidebar-bottom"><span className="sidebar-email">{user.email}</span><LogoutButton /></div>
    </aside>
    <div className="dashboard-main">{children}</div>
  </div>;
}
