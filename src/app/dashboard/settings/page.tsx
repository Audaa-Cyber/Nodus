import { redirect } from "next/navigation";
import { getBusinessContext } from "@/lib/auth/business-context";
import ProfileForm from "@/components/profile-form";

export default async function BusinessProfilePage() {
  const { user, business } = await getBusinessContext();
  if (!user) redirect("/login");
  if (!business) return <main className="dashboard-content"><h1>Business profile unavailable</h1><p>Apply the Supabase migration to finish setting up your business account.</p></main>;
  return <main className="dashboard-content narrow-content"><header className="page-title"><p className="eyebrow">ACCOUNT</p><h1>Business profile</h1><p>Manage the details attached to your Nodus account.</p></header><section className="profile-sheet"><ProfileForm businessName={business.business_name} receivingNetwork={business.receiving_network} receivingAddress={business.receiving_address} /><dl><div><dt>Account email</dt><dd>{business.email}</dd></div><div><dt>Created</dt><dd>{new Date(business.created_at).toLocaleDateString()}</dd></div><div><dt>Last updated</dt><dd>{new Date(business.updated_at).toLocaleDateString()}</dd></div></dl></section></main>;
}
