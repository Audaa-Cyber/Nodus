import type { Database } from "@/types/database";

export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type InvoiceStatus = Invoice["status"];

export function effectiveStatus(invoice: Pick<Invoice, "status" | "due_date">, today = new Date().toISOString().slice(0, 10)): InvoiceStatus {
  if (invoice.status === "open" && invoice.due_date && invoice.due_date < today) return "overdue";
  return invoice.status;
}

const KNOWN_CRYPTO_TOKENS = new Set([
  "USDC",
  "USDT",
  "NEAR",
  "ETH",
  "SOL",
  "BTC",
  "DAI",
  "POL",
  "AVAX",
  "BNB",
]);

export function formatMoney(minor: number, currency: string): string {
  const normalizedCurrency = (currency || "USD").trim().toUpperCase();
  const amount = (minor || 0) / 100;

  const formattedNumber = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  if (KNOWN_CRYPTO_TOKENS.has(normalizedCurrency)) {
    return `${formattedNumber} ${normalizedCurrency}`;
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${formattedNumber} ${normalizedCurrency}`;
  }
}

export function formatUtcDate(dateString: string): string {
  try {
    const iso = dateString.includes("T") ? dateString : `${dateString}T00:00:00Z`;
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return dateString;
  }
}

export function parseInvoiceForm(formData: FormData) {
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  const lineItemsRaw = get("lineItems");
  const taxRateBps = Number(get("taxRateBps") || 0);
  const discountMinor = Number(get("discountMinor") || 0);
  const invoiceFooter = get("invoiceFooter").slice(0, 1000);
  const currency = get("currency").toUpperCase();
  const issueDate = get("issueDate");
  const dueDate = get("dueDate") || null;

  let lineItems: Array<{description:string;quantity:number;unitPriceMinor:number;lineTotalMinor:number}>;
  try {
    const raw = JSON.parse(lineItemsRaw);
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100) throw new Error();
    lineItems = raw.map((item: unknown) => {
      if (!item || typeof item !== "object") throw new Error();
      const row = item as Record<string, unknown>, description = String(row.description ?? "").trim();
      const quantity = Number(row.quantity), unitPriceMinor = Number(row.unitPriceMinor);
      if (!description || description.length > 500 || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000 || !Number.isSafeInteger(unitPriceMinor) || unitPriceMinor < 0 || unitPriceMinor > 999999999999) throw new Error();
      const lineTotalMinor = Math.round(quantity * unitPriceMinor);
      if (!Number.isSafeInteger(lineTotalMinor)) throw new Error();
      return {description,quantity,unitPriceMinor,lineTotalMinor};
    });
  } catch { throw new Error("Add at least one valid item with description, quantity, and unit price."); }
  const subtotalMinor = lineItems.reduce((sum,item)=>sum+item.lineTotalMinor,0);
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor < 1 || subtotalMinor > 999999999999) throw new Error("Invoice subtotal is outside the supported range.");
  if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) throw new Error("Tax must be between 0% and 100%.");
  if (!Number.isSafeInteger(discountMinor) || discountMinor < 0 || discountMinor > subtotalMinor + Math.round(subtotalMinor*taxRateBps/10000)) throw new Error("Discount cannot exceed subtotal and tax.");
  const amountMinor = subtotalMinor + Math.round(subtotalMinor*taxRateBps/10000) - discountMinor;
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > 999999999999) throw new Error("Invoice total is outside the supported range.");
  const description = lineItems.map(item=>item.description).join("; ").slice(0,2000);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Use a three-letter currency code, such as USD.");
  const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!isValidDate(issueDate)) throw new Error("Choose a valid issue date.");
  if (dueDate && !isValidDate(dueDate)) throw new Error("Choose a valid due date.");
  if (dueDate && dueDate < issueDate) throw new Error("Due date must be on or after the issue date.");

  return { customer_name: null, customer_email: null, description, line_items: lineItems, subtotal_minor: subtotalMinor, tax_rate_bps: taxRateBps, discount_minor: discountMinor, invoice_footer: invoiceFooter, amount_minor: amountMinor, currency, issue_date: issueDate, due_date: dueDate };
}
