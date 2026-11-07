import { redirect } from "next/navigation";
import { getBusinessContext } from "@/lib/auth/business-context";
import ProfileForm from "@/components/profile-form";
import { withTransitionDelay } from "@/lib/utils/timing";

function formatUtcDate(dateString: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}

export default async function BusinessProfilePage() {
  const { user, business } = await withTransitionDelay(getBusinessContext(), 700);
  if (!user) redirect("/login");
  if (!business) return <main className="dashboard-content"><h1>Business profile unavailable</h1><p>Apply the Supabase migration to finish setting up your business account.</p></main>;
  return <main className="dashboard-content narrow-content"><header className="page-title"><p className="eyebrow">ACCOUNT</p><h1>Business profile</h1><p>Manage the details attached to your Nodus account.</p></header><section className="profile-sheet"><ProfileForm businessName={business.business_name} receivingNetwork={business.receiving_network} receivingAddress={business.receiving_address} /><dl><div><dt>Account email</dt><dd>{business.email}</dd></div><div><dt>Created</dt><dd>{formatUtcDate(business.created_at)}</dd></div><div><dt>Last updated</dt><dd>{formatUtcDate(business.updated_at)}</dd></div></dl></section></main>;
}
