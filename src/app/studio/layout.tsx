import { notFound } from "next/navigation";
import { getCmsAdmin } from "@/lib/cms/admin";
import "./studio.css";

export const metadata = {
  title: "Nodus Studio",
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCmsAdmin();
  if (!admin) notFound();
  return <>{children}</>;
}
