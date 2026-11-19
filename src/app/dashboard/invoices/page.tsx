import Link from "next/link";
import { redirect } from "next/navigation";
import { getBusinessContext } from "@/lib/auth/business-context";
import { InvoicesTable, type InvoiceListItem } from "@/components/invoices-table";
import { InvoiceFilters } from "@/components/invoice-filters";

type SearchParams = { page?: string; q?: string; status?: string; date?: string; dateBy?: string; from?: string; to?: string; min?: string; max?: string; currency?: string; sort?: string };
function validDate(value?: string) { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const d = new Date(value + "T00:00:00.000Z"); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value; }
function nextDay(value: string) { const d = new Date(value + "T00:00:00.000Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString(); }
function startOfMonth(value: string) { return value.slice(0, 7) + "-01"; }

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 25;
  const today = new Date().toISOString().slice(0, 10);
  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login");
  if (!business) return <div className="w-full max-w-[650px] mx-auto"><div className="surface-card p-6 sm:p-8"><h1 className="text-xl font-bold mb-2">Business profile unavailable</h1><p className="text-xs" style={{ color: "var(--text-secondary)" }}>Apply the Supabase migration to finish setting up your business account.</p></div></div>;

  let query = supabase.from("invoices").select("id,invoice_number,customer_name,customer_email,amount_minor,currency,status,due_date,issue_date,created_at,updated_at", { count: "exact" }).eq("business_id", business.id);
  const term = (params.q ?? "").trim().replace(/[,%()\\"*_]/g, " ").replace(/\s+/g, " ").slice(0, 100);
  if (term) { const pattern = `%${term}%`; query = query.or(`invoice_number.ilike.${pattern},customer_name.ilike.${pattern},customer_email.ilike.${pattern}`); }
  const statuses = ["draft", "open", "paid", "overdue", "cancelled"] as const;
  if (params.status && statuses.includes(params.status as (typeof statuses)[number])) {
    const selectedStatus = params.status as (typeof statuses)[number];
    if (selectedStatus === "overdue") query = query.or(`status.eq.overdue,and(status.eq.open,due_date.lt.${today})`);
    else if (selectedStatus === "open") query = query.eq("status", "open").or(`due_date.is.null,due_date.gte.${today}`);
    else query = query.eq("status", selectedStatus);
  }
  let from = ""; let to = "";
  if (params.date === "custom") { from = validDate(params.from) ? params.from! : ""; to = validDate(params.to) ? params.to! : ""; }
  else if (params.date === "today") from = to = today;
  else if (params.date === "7d" || params.date === "30d") { const d = new Date(today + "T00:00:00.000Z"); d.setUTCDate(d.getUTCDate() - (params.date === "7d" ? 6 : 29)); from = d.toISOString().slice(0, 10); to = today; }
  else if (params.date === "this-month") { from = startOfMonth(today); to = today; }
  else if (params.date === "last-month") { const d = new Date(today + "T00:00:00.000Z"); d.setUTCDate(1); d.setUTCDate(0); to = d.toISOString().slice(0, 10); from = startOfMonth(to); }
  const dateColumn = params.dateBy === "due" ? "due_date" : "created_at";
  if (dateColumn === "due_date") { if (from) query = query.gte("due_date", from); if (to) query = query.lte("due_date", to); }
  else { if (from) query = query.gte("created_at", from + "T00:00:00.000Z"); if (to) query = query.lt("created_at", nextDay(to)); }
  const currency = (params.currency ?? "").toUpperCase();
  const hasCurrency = /^[A-Z]{3,8}$/.test(currency);
  if (hasCurrency) query = query.eq("currency", currency);
  const min = params.min?.trim() ? Number(params.min) : NaN; const max = params.max?.trim() ? Number(params.max) : NaN;
  if (hasCurrency) {
    if (Number.isFinite(min) && min >= 0) query = query.gte("amount_minor", Math.round(min * 100));
    if (Number.isFinite(max) && max >= 0) query = query.lte("amount_minor", Math.round(max * 100));
  }
  const sort = ["oldest", "amount-high", "amount-low", "updated", "due"].includes(params.sort ?? "") ? params.sort! : "newest";
  if (sort === "oldest") query = query.order("created_at", { ascending: true });
  else if (sort === "amount-high" && hasCurrency) query = query.order("amount_minor", { ascending: false }).order("created_at", { ascending: false });
  else if (sort === "amount-low" && hasCurrency) query = query.order("amount_minor", { ascending: true }).order("created_at", { ascending: false });
  else if (sort === "updated") query = query.order("updated_at", { ascending: false });
  else if (sort === "due") query = query.order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  else query = query.order("created_at", { ascending: false });
  const { data: invoices, count, error } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const filterParams = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (key !== "page" && value) filterParams.set(key, value);
  const queryString = filterParams.toString();
  return <div className="w-full max-w-[900px] mx-auto space-y-6">
    <div className="stagger-item delay-1 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"><div><span className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>BILLING</span><h1 className="text-3xl sm:text-[34px] font-bold tracking-tight text-slate-900 mb-1.5">Invoices</h1><p className="text-xs" style={{ color: "var(--text-secondary)" }}>{count ?? 0} invoices</p></div><Link href="/dashboard/invoices/new" className="button button-dark self-start sm:self-auto"><span>Create invoice ↗</span></Link></div>
    <InvoiceFilters values={params} />
    <div className="stagger-item delay-2"><div className="surface-card overflow-hidden"><div className="relative z-10"><InvoicesTable initialInvoices={(invoices ?? []) as InvoiceListItem[]} count={count} page={page} pageSize={pageSize} totalPages={totalPages} queryString={queryString} hasFilters={Boolean(queryString)} hasError={Boolean(error)} />{!error && !(invoices?.length) && <div className="px-6 pb-6 text-center"><Link href="/dashboard/invoices" className="text-xs font-semibold underline">Clear filters</Link></div>}</div></div></div>
  </div>;
}