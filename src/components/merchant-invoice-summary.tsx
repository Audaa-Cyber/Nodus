import { formatMoney } from "@/lib/invoices";
import type { PaidInvoiceProps } from "@/components/paid-invoice-detail-view";

function shortAddress(value?: string | null) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "Unavailable";
}

export function MerchantInvoiceSummary({ invoice, seller, paid = false }: Pick<PaidInvoiceProps, "invoice" | "seller"> & { paid?: boolean }) {
  const items = Array.isArray(invoice.line_items) ? invoice.line_items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
  const subtotal = invoice.subtotal_minor ?? invoice.amount_minor;
  const taxRate = invoice.tax_rate_bps ?? 0;
  const tax = Math.round(subtotal * taxRate / 10000);
  return <section className="card cd invoice-print-sheet">
    <div className="top"><h2 style={{ margin: 0 }}>Invoice summary &amp; items</h2><span className="chip">#{invoice.invoice_number}</span></div>
    <div className="parties">
      <div><h3 className="lab">Billed by</h3><p className="nm">{seller.business_name}</p>
        {seller.address && <p>{seller.address}</p>}{seller.email && <p>{seller.email}</p>}{seller.phone && <p>{seller.phone}</p>}
        {seller.tax_id && <p className="m"><b>Tax ID / EIN</b> {seller.tax_id}</p>}
        <p className="m"><b>Receiving wallet</b> {shortAddress(seller.receiving_address)}</p>
      </div>
      <div><h3 className="lab">Billed to</h3><p className="nm">{invoice.customer_name || "Customer"}</p>
        {invoice.customer_company && <p>{invoice.customer_company}</p>}
        {invoice.customer_email && <p>{invoice.customer_email}</p>}
        {invoice.customer_phone && <p>{invoice.customer_phone}</p>}
        {invoice.customer_address && <p>{invoice.customer_address}</p>}
      </div>
    </div>
    <div className="tw"><table>
      <colgroup><col /><col className="q" /><col className="u" /><col className="t" /></colgroup>
      <thead><tr><th>Item description</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead>
      <tbody>{items.length ? items.map((item, index) => <tr key={index}>
        <td><b>{typeof item.description === "string" ? item.description : "Item"}</b>{typeof item.details === "string" && <span>{item.details}</span>}</td>
        <td>{typeof item.quantity === "number" ? item.quantity : "—"}</td>
        <td>{typeof item.unitPriceMinor === "number" ? formatMoney(item.unitPriceMinor, invoice.currency) : "—"}</td>
        <td>{typeof item.lineTotalMinor === "number" ? formatMoney(item.lineTotalMinor, invoice.currency) : "—"}</td>
      </tr>) : <tr><td><b>{invoice.description || "Invoice"}</b></td><td>—</td><td>—</td><td>{formatMoney(invoice.amount_minor, invoice.currency)}</td></tr>}</tbody>
    </table></div>
    <div className="sum">
      <p><span>Subtotal</span><span>{formatMoney(subtotal, invoice.currency)}</span></p>
      <p><span>Tax ({taxRate / 100}%)</span><span>{formatMoney(tax, invoice.currency)}</span></p>
      <p><span>Discount</span><span>{formatMoney(invoice.discount_minor ?? 0, invoice.currency)}</span></p>
      <p className="t"><span>{paid ? "Net Total Paid" : "Net Total Due"}</span><span>{formatMoney(invoice.amount_minor, invoice.currency)}{invoice.currency.toUpperCase() !== "USDC" && " USDC"}</span></p>
    </div>
  </section>;
}
