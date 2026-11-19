import { redirect } from "next/navigation";
import { getBusinessContext } from "@/lib/auth/business-context";
import ProfileForm from "@/components/profile-form";
import InvoiceDefaultsForm from "@/components/invoice-defaults-form";

export default async function BusinessProfilePage() {
  const { user, business } = await getBusinessContext();
  if (!user) redirect("/login");
  if (!business) {
    return (
      <div className="w-full max-w-[650px] mx-auto">
        <div className="surface-card p-6 sm:p-8">
          <h1 className="text-xl font-bold mb-2">Business profile unavailable</h1>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Your account is signed in, but the business profile could not be created. Refresh the page or contact support.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
    <ProfileForm
      businessName={business.business_name}
      receivingNetworks={business.receiving_networks ?? []}
      receivingAddress={business.receiving_address}
      email={business.email ?? user.email ?? ""}
      createdAt={business.created_at}
      updatedAt={business.updated_at}
    />
    <InvoiceDefaultsForm logoUrl={business.logo_url ?? ""} businessPhone={business.business_phone ?? ""} businessAddress={business.business_address ?? ""} websiteUrl={business.website_url ?? ""} taxRegistrationNumber={business.tax_registration_number ?? ""} invoicePrefix={business.invoice_prefix ?? "INV"} defaultCurrency={business.default_currency ?? "USD"} paymentTermsDays={business.default_payment_terms_days ?? 14} invoiceFooter={business.invoice_footer ?? "Thank you for your business."} />
    </>
  );
}
