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

export function parseInvoiceForm(formData: FormData) {
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  const invoiceNumber = get("invoiceNumber");
  const customerName = get("customerName");
  const customerEmail = get("customerEmail").toLowerCase() || null;
  const description = get("description");
  const amount = get("amount");
  const currency = get("currency").toUpperCase();
  const issueDate = get("issueDate");
  const dueDate = get("dueDate") || null;

  if (!invoiceNumber || invoiceNumber.length > 64) throw new Error("Invoice number is required and must be at most 64 characters.");
  if (!customerName || customerName.length > 160) throw new Error("Customer name is required and must be at most 160 characters.");
  if (customerEmail && (customerEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))) throw new Error("Enter a valid customer email address.");
  if (!description || description.length > 2000) throw new Error("Description is required and must be at most 2,000 characters.");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount)) throw new Error("Enter an amount with up to two decimal places.");
  const [whole, fraction = ""] = amount.split(".");
  const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > 999999999999) throw new Error("Amount is outside the supported range.");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Use a three-letter currency code, such as USD.");
  const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!isValidDate(issueDate)) throw new Error("Choose a valid issue date.");
  if (dueDate && !isValidDate(dueDate)) throw new Error("Choose a valid due date.");
  if (dueDate && dueDate < issueDate) throw new Error("Due date must be on or after the issue date.");

  return { invoice_number: invoiceNumber, customer_name: customerName, customer_email: customerEmail, description, amount_minor: amountMinor, currency, issue_date: issueDate, due_date: dueDate };
}
