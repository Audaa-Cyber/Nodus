import Image from "next/image";
import { PayerIcon } from "./payer-design-icons";
import type { LineItem } from "./payment-success-card";

export type PayerInvoiceSheetProps = {
  invoiceNumber: string;
  status: string;
  businessName: string;
  logoUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  customerName?: string | null;
  customerCompany?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  amount: string;
  currency?: string;
  subtotal: string;
  tax: string;
  taxPercent: string;
  discount: string;
  issueDate: string;
  dueDate: string;
  network: string;
  recipient: string;
  signature?: string | null;
  signatureTitle?: string | null;
  items: Array<LineItem & { note?: string; price: string; total: string }>;
};

export function PayerInvoiceSheet(invoice: PayerInvoiceSheetProps) {
  const currency = invoice.currency ?? "USDC";
  const hasCustomerDetails = Boolean(invoice.customerName || invoice.customerCompany || invoice.customerEmail || invoice.customerPhone || invoice.customerAddress);
  return <article className="sheet" aria-label={`Invoice from ${invoice.businessName}`}>
    <header className="head">
      <div>
        <div className="brand">
          {invoice.logoUrl ? <Image src={invoice.logoUrl} alt="" width={44} height={44} unoptimized style={{ objectFit: "contain" }} /> : <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><rect width="44" height="44" fill="#171816" /><text x="22" y="29" textAnchor="middle" fill="#F6F1E8" fontSize="24">{invoice.businessName.charAt(0)}</text></svg>}
          <div><b>{invoice.businessName}</b><span>{invoice.signatureTitle ?? ""}</span></div>
        </div>
        <h1>INVOICE</h1>
        <span className="no">No. {invoice.invoiceNumber}</span><br />
        <span className="pill"><span className="dot" />{invoice.status.toUpperCase()}{invoice.dueDate !== "—" ? ` · DUE ${invoice.dueDate.toUpperCase()}` : ""}</span>
      </div>
      <section className="dos" aria-label="Merchant business dossier">
        <h2>Business details</h2>
        <dl className="d">
          <div><PayerIcon name="phone" /><dd style={{ margin: 0 }}>{invoice.phone || "—"}</dd></div>
          <div><PayerIcon name="mail" /><dd style={{ margin: 0 }}>{invoice.email || "—"}</dd></div>
          <div><PayerIcon name="pin" /><dd style={{ margin: 0 }}>{invoice.address || "—"}</dd></div>
          <div><PayerIcon name="id" /><dd style={{ margin: 0 }}>Tax ID / EIN: {invoice.taxId || "—"}</dd></div>
        </dl>
      </section>
    </header>
    <section className="row2" style={{ gridTemplateColumns: hasCustomerDetails ? undefined : "1fr" }}>
      {hasCustomerDetails && <div className="to">
        <h2>Invoice to</h2>
        {invoice.customerName && <div className="nm">{invoice.customerName}</div>}
        {invoice.customerCompany && <div className="co">{invoice.customerCompany}</div>}
        <dl className="d">
          {invoice.customerAddress && <div><PayerIcon name="pin" /><dd style={{ margin: 0 }}>{invoice.customerAddress}</dd></div>}
          {invoice.customerPhone && <div><PayerIcon name="phone" /><dd style={{ margin: 0 }}>{invoice.customerPhone}</dd></div>}
          {invoice.customerEmail && <div><PayerIcon name="mail" /><dd style={{ margin: 0 }}>{invoice.customerEmail}</dd></div>}
        </dl>
      </div>}
      <div>
        <div className="banner"><div className="t"><small>Total:</small><div className="amt">{invoice.amount} {currency}</div></div></div>
        <div className="dates"><p>INVOICE DATE: <b>{invoice.issueDate}</b></p><p>DATE DUE: <b>{invoice.dueDate}</b></p></div>
      </div>
    </section>
    <div className="tw">
      <table>
        <colgroup><col style={{ width: 60 }} /><col /><col style={{ width: 112 }} /><col style={{ width: 76 }} /><col style={{ width: 128 }} /></colgroup>
        <thead><tr><th>No</th><th className="ds">Description</th><th>Price</th><th>QTY</th><th>Amount</th></tr></thead>
        <tbody>{invoice.items.map((item, index) => <tr key={index}><td>{String(index + 1).padStart(2, "0")}</td><td className="ds"><b>{item.description}</b>{item.note && <span>{item.note}</span>}</td><td className="pr">{item.price}</td><td className="q">{item.quantity}</td><td className="am">{item.total}</td></tr>)}</tbody>
      </table>
    </div>
    <div className="sum">
      <p><span>Subtotal</span><span>{invoice.subtotal}</span></p>
      <p><span>Tax ({invoice.taxPercent}%)</span><span>{invoice.tax}</span></p>
      {invoice.discount !== "0.00 " + currency && <p><span>Discount</span><span>{invoice.discount}</span></p>}
      <div className="tot"><span>Total due</span><span>{invoice.amount} {currency}</span></div>
    </div>
    <footer className="foot">
      <section>
        <h3>Payment details</h3>
        <dl className="kv"><dt>Asset</dt><dd>{currency}</dd><dt>Network</dt><dd>{invoice.network}</dd><dt>Payee address</dt><dd className="payer-payee-address">{invoice.recipient}</dd></dl>
        <p className="guar"><PayerIcon name="lock" /><span>Before paying, confirm the token and network in checkout match the payment details shown by your wallet.</span></p>
      </section>
      <section className="sig"><span className="cv">{invoice.signature || invoice.businessName}</span><svg viewBox="0 0 200 20" aria-hidden="true"><path d="M4 14C40 4 72 18 104 9s60-6 92 3" /></svg><p><b>Authorized Signatory</b>{invoice.signatureTitle ? ` / ${invoice.signatureTitle}` : ""}</p></section>
    </footer>
  </article>;
}
