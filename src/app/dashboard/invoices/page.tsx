import Link from "next/link";
import { redirect } from "next/navigation";
import { getBusinessContext } from "@/lib/auth/business-context";
import { InvoicesTable, type InvoiceListItem } from "@/components/invoices-table";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 25;
  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login");
  if (!business) {
    return (
      <div className="w-full max-w-[650px] mx-auto">
        <div className="surface-card p-6 sm:p-8">
          <h1 className="text-xl font-bold mb-2">Business profile unavailable</h1>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Apply the Supabase migration to finish setting up your business account.
          </p>
        </div>
      </div>
    );
  }

  const { data: invoices, count, error } = await supabase
    .from("invoices")
    .select("id,invoice_number,amount_minor,currency,status,due_date,created_at", { count: "exact" })
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  return (
    <div className="w-full max-w-[760px] mx-auto space-y-6">
      {/* Section Header */}
      <div className="stagger-item delay-1 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>
            BILLING
          </span>
          <h1 className="text-3xl sm:text-[34px] font-bold tracking-tight text-slate-900 mb-1.5">
            Invoices
          </h1>
        </div>
        <Link href="/dashboard/invoices/new" className="button button-dark self-start sm:self-auto">
          <span>Create invoice ↗</span>
        </Link>
      </div>

      {/* Invoices Table Card */}
      <div className="stagger-item delay-2">
        <div className="surface-card overflow-hidden">
          <div className="relative z-10">
            <InvoicesTable
              initialInvoices={(invoices ?? []) as InvoiceListItem[]}
              count={count}
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              hasError={Boolean(error)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
