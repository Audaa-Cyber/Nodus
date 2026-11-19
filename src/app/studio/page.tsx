import { notFound } from "next/navigation";
import { getCmsAdmin } from "@/lib/cms/admin";
import { StudioDashboard } from "@/components/studio-dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nodus Studio", robots: { index: false, follow: false, noarchive: true } };

export default async function StudioPage() {
  const admin = await getCmsAdmin();
  if (!admin) notFound();
  return <StudioDashboard adminEmail={admin.email ?? "Nodus administrator"} adminRole={admin.role} />;
}
