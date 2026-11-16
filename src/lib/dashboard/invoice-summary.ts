import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type InvoiceSummary = {
  total: number;
  paid: number;
  open: number;
  overdue: number;
  cancelled: number;
  draft: number;
};

export async function getInvoiceSummary(
  supabase: SupabaseClient<Database>,
  businessId: string,
  today: string,
): Promise<InvoiceSummary | null> {
  // Count in Postgres: selecting rows and using .length silently stops at the API row limit.
  // Keep the cookie-bound client and business filter so every count respects owner RLS.
  const countInvoices = () => supabase.from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  const [total, paid, open, overdue, cancelled, draft] = await Promise.all([
    countInvoices(),
    countInvoices().eq("status", "paid"),
    countInvoices().eq("status", "open").or(`due_date.is.null,due_date.gte.${today}`),
    countInvoices().or(`status.eq.overdue,and(status.eq.open,due_date.lt.${today})`),
    countInvoices().eq("status", "cancelled"),
    countInvoices().eq("status", "draft"),
  ]);

  if ([total, paid, open, overdue, cancelled, draft].some((result) => result.error || result.count === null)) {
    return null;
  }

  return {
    total: total.count!, paid: paid.count!, open: open.count!,
    overdue: overdue.count!, cancelled: cancelled.count!, draft: draft.count!,
  };
}
