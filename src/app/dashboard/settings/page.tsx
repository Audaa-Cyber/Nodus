import { redirect } from "next/navigation";
import { getBusinessContext } from "@/lib/auth/business-context";
import ProfileForm from "@/components/profile-form";
import { withTransitionDelay } from "@/lib/utils/timing";

export default async function BusinessProfilePage() {
  const { user, business } = await withTransitionDelay(getBusinessContext(), 700);
  if (!user) redirect("/login");
  if (!business) {
    return (
      <div className="card-perspective w-full max-w-[650px] mx-auto">
        <div className="aether-card p-6 sm:p-8">
          <h1 className="text-xl font-bold mb-2">Business profile unavailable</h1>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Apply the Supabase migration to finish setting up your business account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ProfileForm
      businessName={business.business_name}
      receivingNetwork={business.receiving_network}
      receivingAddress={business.receiving_address}
      email={business.email ?? user.email ?? ""}
      createdAt={business.created_at}
      updatedAt={business.updated_at}
    />
  );
}
