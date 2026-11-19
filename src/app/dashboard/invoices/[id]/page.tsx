import { MerchantOpenSurface } from "@/components/merchant-open-surface";
import { notFound, redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { PaidInvoiceDetailView } from "@/components/paid-invoice-detail-view";
import { getBusinessContext } from "@/lib/auth/business-context";
import { effectiveStatus } from "@/lib/invoices";

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cancelled?: string; error?: string; issued?: string; token?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  )
    notFound();

  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login");
  if (!business) notFound();

  const [
    { data: invoice, error },
    { data: receipts },
    { data: settlements },
    { data: attempts },
  ] = await Promise.all([
      supabase
        .from("invoices")
        .select("*")
        .eq("id", id)
        .eq("business_id", business.id)
        .maybeSingle(),

      supabase
        .from("payment_receipts")
        .select("id,receipt_number,issued_at,payment_attempt_id,payment_settlement_id")
        .eq("invoice_id", id)
        .eq("business_id", business.id)
        .order("issued_at", { ascending: false }),

      supabase
        .from("payment_settlements")
        .select(
          "id,payment_attempt_id,outcome,destination_asset_id,destination_network,recipient_address,received_amount_base_units,received_asset_decimals,destination_tx_hashes,evidence,created_at"
        )
        .eq("invoice_id", id)
        .eq("business_id", business.id),

      supabase
        .from("payment_attempts")
        .select(
          "id,source_asset_id,source_network,destination_asset_id,destination_network,transaction_hash,requested_amount,expected_received_amount,deposit_address,mode,status,quote_snapshot,created_at,updated_at"
        )
        .eq("invoice_id", id)
        .eq("business_id", business.id)
        .order("created_at", { ascending: false }),

    ]);

  if (error || !invoice) notFound();
  const sellerSnapshot = invoice.seller_snapshot && typeof invoice.seller_snapshot === "object" && !Array.isArray(invoice.seller_snapshot) ? invoice.seller_snapshot as Record<string, unknown> : {};
  const invoiceSellerName = typeof sellerSnapshot.business_name === "string" ? sellerSnapshot.business_name : business.business_name;
  const invoiceSellerLogo = typeof sellerSnapshot.logo_url === "string" ? sellerSnapshot.logo_url : business.logo_url;
  const invoiceSellerPhone = typeof sellerSnapshot.business_phone === "string" ? sellerSnapshot.business_phone : business.business_phone;
  const invoiceSellerAddress = typeof sellerSnapshot.business_address === "string" ? sellerSnapshot.business_address : business.business_address;
  const invoiceSellerWebsite = typeof sellerSnapshot.website_url === "string" ? sellerSnapshot.website_url : business.website_url;
  const invoiceSellerTaxId = typeof sellerSnapshot.tax_registration_number === "string" ? sellerSnapshot.tax_registration_number : business.tax_registration_number;
  const invoiceSellerFooter = typeof sellerSnapshot.invoice_footer === "string" ? sellerSnapshot.invoice_footer : (invoice.invoice_footer || business.invoice_footer || "Thank you for your business.");

  const status = effectiveStatus(invoice);
  const isPaid = invoice.status === "paid";
  const isCancelled = invoice.status === "cancelled";

  let initialPayUrl: string | null = null;
  if (query.token && invoice.share_token_hash && invoice.share_token_expires_at && Date.parse(invoice.share_token_expires_at) > Date.now()) {
    const calculatedHash = createHash("sha256").update(query.token, "utf8").digest("hex");
    if (calculatedHash === invoice.share_token_hash) {
      const origin =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : "http://localhost:3000");
      initialPayUrl = `${origin}/pay/${query.token}`;
    }
  }

  // Share panel state
  const shareState = !invoice.share_token_hash
    ? "none"
    : invoice.share_token_expires_at &&
        new Date(invoice.share_token_expires_at).getTime() > Date.now()
      ? "active"
      : "expired";

  const canEdit = status === "draft" || status === "open" || status === "overdue";
  const canCancel = canEdit;
  // Paid and cancelled invoices must not expose active share/payment actions
  const canShare = status === "open" || status === "overdue";

  // For paid invoices, find the primary verified receipt + settlement
  const primaryReceipt = receipts && receipts.length > 0 ? receipts[0] : null;
  const primarySettlement = primaryReceipt
    ? settlements?.find((s) => s.payment_attempt_id === primaryReceipt.payment_attempt_id) ?? null
    : null;
  const primaryAttempt = primaryReceipt
    ? attempts?.find((a) => a.id === primaryReceipt.payment_attempt_id) ?? null
    : null;

  if (isPaid) {
    return (
      <div className="dashboard-content narrow-content">
        <PaidInvoiceDetailView
          invoice={invoice}
          seller={{
            business_name: invoiceSellerName,
            logo_url: invoiceSellerLogo,
            phone: invoiceSellerPhone,
            address: invoiceSellerAddress,
            website: invoiceSellerWebsite,
            tax_id: invoiceSellerTaxId,
            email: typeof sellerSnapshot.email === "string" ? sellerSnapshot.email : business.email,
            invoice_footer: invoiceSellerFooter,
            receiving_address: business.receiving_address,
          }}
          primaryReceipt={primaryReceipt}
          primarySettlement={primarySettlement}
          primaryAttempt={primaryAttempt}
          receipts={receipts}
          settlements={settlements}
        />
      </div>
    );
  }

  return <MerchantOpenSurface invoice={invoice} seller={{ business_name: invoiceSellerName, logo_url: invoiceSellerLogo, phone: invoiceSellerPhone, address: invoiceSellerAddress, website: invoiceSellerWebsite, tax_id: invoiceSellerTaxId, email: typeof sellerSnapshot.email === "string" ? sellerSnapshot.email : business.email, invoice_footer: invoiceSellerFooter, receiving_address: business.receiving_address }} receivingNetwork={business.receiving_network} status={status} query={query} canEdit={canEdit} canCancel={canCancel} canShare={canShare} isCancelled={isCancelled} shareState={shareState} initialPayUrl={initialPayUrl} receipts={receipts} settlements={settlements} />;
}
