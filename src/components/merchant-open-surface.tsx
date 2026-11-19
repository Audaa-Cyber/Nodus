import Link from "next/link";
import CancelInvoiceForm from "@/components/cancel-invoice-form";
import InvoiceSharePanel from "@/components/invoice-share-panel";
import InvoicePrintButton from "@/components/invoice-print-button";
import { InvoiceDetailLiveSync } from "@/components/invoice-detail-live-sync";
import { MerchantInvoiceSummary } from "@/components/merchant-invoice-summary";
import { MerchantIcon } from "@/components/merchant-icon";
import { MerchantReceiptHistory } from "@/components/merchant-receipt-history";
import type { PaidInvoiceProps } from "@/components/paid-invoice-detail-view";
import { formatMoney, formatUtcDate } from "@/lib/invoices";
import { getWalletNetwork } from "@/lib/wallet/networks";

type MerchantOpenProps = {
  invoice: PaidInvoiceProps["invoice"] & { status: string; share_token_expires_at: string | null };
  seller: PaidInvoiceProps["seller"];
  receivingNetwork: string | null;
  status: string;
  query: { cancelled?: string; error?: string; issued?: string };
  canEdit: boolean;
  canCancel: boolean;
  canShare: boolean;
  isCancelled: boolean;
  shareState: "active" | "expired" | "none";
  initialPayUrl: string | null;
  receipts: PaidInvoiceProps["receipts"];
  settlements: PaidInvoiceProps["settlements"];
};

export function MerchantOpenSurface({ invoice, seller, receivingNetwork, status, query, canEdit, canCancel, canShare, isCancelled, shareState, initialPayUrl, receipts, settlements }: MerchantOpenProps) {
  const id = invoice.id;
  const isPaid = invoice.status === "paid";
  return <div className="merchant-design" data-state="open"><main className="page">
    <InvoiceDetailLiveSync invoiceId={id} currentStatus={invoice.status} />
    <div className="nav"><Link className="back" href="/dashboard/invoices"><MerchantIcon name="back" />Back to invoices</Link></div>
    <section className="card hd"><div>
      <h1><span className="n">#{invoice.invoice_number}</span><span className="st o" data-s="open"><i />{status === "open" ? "Open" : status === "overdue" ? "Overdue" : status === "draft" ? "Draft" : "Cancelled"}</span></h1>
      <p className="sub" data-s="open">Issued {formatUtcDate(invoice.issue_date)}{invoice.due_date && <> · Due {formatUtcDate(invoice.due_date)}</>} · {isCancelled ? "Payment link disabled" : status === "draft" ? "Ready to issue" : "Waiting for the customer to pay"}</p>
    </div><div className="acts">
      <InvoicePrintButton className="btn"><MerchantIcon name="print" />Print / Save PDF</InvoicePrintButton>
      {canEdit && <Link className="btn" data-s="open" href={`/dashboard/invoices/${id}/edit`}><MerchantIcon name="edit" />Edit</Link>}
      {canCancel && <CancelInvoiceForm invoiceId={id} className="btn x"><MerchantIcon name="x" />Cancel Invoice</CancelInvoiceForm>}
    </div></section>
    {(query.issued === "1" || query.issued) && <section className="ban" role="status"><span className="c"><MerchantIcon name="check" /></span><div><b>Invoice issued successfully. Ready for customer payment.</b></div></section>}
    {query.cancelled && <p className="sub" role="status">Invoice cancelled. It can no longer be payable.</p>}
    {query.error && <p className="sub" role="alert">Invoice could not be cancelled.</p>}
    <section className="card amt"><div><p className="lab">Amount due</p><div className="big">{formatMoney(invoice.amount_minor, invoice.currency)}<small>USDC</small></div></div><span className="net"><i />{receivingNetwork ? getWalletNetwork(receivingNetwork)?.label ?? receivingNetwork : "Unavailable"}</span></section>
    {!isPaid && !isCancelled && <InvoiceSharePanel invoiceId={id} invoiceNumber={invoice.invoice_number} shareState={shareState} expiresAt={invoice.share_token_expires_at} canShare={canShare} initialUrl={initialPayUrl ?? undefined} />}
    <MerchantInvoiceSummary invoice={invoice} seller={seller} />
    <MerchantReceiptHistory receipts={receipts} settlements={settlements} />
  </main></div>;
}
