"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import InvoicePrintButton from "@/components/invoice-print-button";
import { CustomerFeedback } from "@/components/invoice-feedback";
import { MerchantIcon } from "@/components/merchant-icon";
import { MerchantInvoiceSummary } from "@/components/merchant-invoice-summary";
import { MerchantReceiptHistory } from "@/components/merchant-receipt-history";
import type { PaidInvoiceProps } from "@/components/paid-invoice-detail-view";
import { formatUtcDate } from "@/lib/invoices";
import { evmWalletChains, getWalletNetwork } from "@/lib/wallet/networks";

function shortHash(value: string) { return value.length > 16 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value; }
function dateTime(value?: string | null) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} · ${date.toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC`;
}
function explorer(network: string | null | undefined, kind: "tx" | "address", value: string) {
  const known = network ? getWalletNetwork(network) : null;
  const base = evmWalletChains.find(chain => chain.id === known?.chainId)?.blockExplorers?.default.url;
  return base ? `${base.replace(/\/$/, "")}/${kind}/${value}` : null;
}
function receivedAmount(amount?: string | null, decimals?: number | null) {
  if (!amount || !/^\d+$/.test(amount) || decimals === null || decimals === undefined || !Number.isInteger(decimals) || decimals < 0 || decimals > 30) return "Unavailable";
  const padded = amount.padStart(decimals + 1, "0");
  const whole = decimals ? padded.slice(0, -decimals) : padded;
  const fraction = decimals ? padded.slice(-decimals).replace(/0+$/, "") : "";
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}
function usdcBaseAmount(value?: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const padded = value.padStart(7, "0");
  return `${padded.slice(0, -6).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${padded.slice(-6)}`;
}
function escrowContract(evidence: unknown) {
  const record = evidence && typeof evidence === "object" && !Array.isArray(evidence) ? evidence as Record<string, unknown> : {};
  for (const value of [record.escrow_contract, record.escrowContract, record.escrow_contract_address, record.escrowContractAddress, process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS]) {
    if (typeof value === "string" && /^0x[\da-fA-F]{40}$/.test(value)) return value;
  }
  return null;
}

export function MerchantPaidSurface({ invoice, seller, primaryReceipt, primarySettlement, primaryAttempt, receipts, settlements }: PaidInvoiceProps) {
  const [copiedKey, setCopiedKey] = useState("");
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const network = primarySettlement?.destination_network ?? primaryAttempt?.destination_network ?? null;
  const networkName = network ? getWalletNetwork(network)?.label ?? network : "Unavailable";
  const hashes = Array.isArray(primarySettlement?.destination_tx_hashes) ? primarySettlement.destination_tx_hashes.filter((value): value is string => typeof value === "string" && /^0x[\da-fA-F]{64}$/.test(value)) : [];
  const contract = escrowContract(primarySettlement?.evidence);
  const paidAt = primarySettlement?.created_at ?? primaryReceipt?.issued_at;
  const verified = primarySettlement?.outcome === "VERIFIED" || primarySettlement?.outcome === "OVERPAID";
  const asset = primarySettlement?.destination_asset_id?.split(":").pop()?.toUpperCase() ?? "USDC";
  const proof = primarySettlement?.evidence && typeof primarySettlement.evidence === "object" && !Array.isArray(primarySettlement.evidence) ? primarySettlement.evidence as Record<string, unknown> : {};
  const destinationProof = proof.destinationProof && typeof proof.destinationProof === "object" && !Array.isArray(proof.destinationProof) ? proof.destinationProof as Record<string, unknown> : {};
  const sourceProof = proof.sourceProof && typeof proof.sourceProof === "object" && !Array.isArray(proof.sourceProof) ? proof.sourceProof as Record<string, unknown> : {};
  const payer = typeof destinationProof.payer === "string" ? destinationProof.payer : typeof sourceProof.payer === "string" ? sourceProof.payer : typeof proof.payer === "string" ? proof.payer : null;
  const sourceUsdc = primaryAttempt?.source_asset_id.toLowerCase().endsWith(":usdc") || primaryAttempt?.source_asset_id.toUpperCase() === "USDC";
  const requested = primaryAttempt?.requested_amount && /^\d+$/.test(primaryAttempt.requested_amount) ? BigInt(primaryAttempt.requested_amount) : null;
  const expected = primaryAttempt?.expected_received_amount && /^\d+$/.test(primaryAttempt.expected_received_amount) ? BigInt(primaryAttempt.expected_received_amount) : null;
  const circleFee = sourceUsdc && requested !== null && expected !== null && requested >= expected ? usdcBaseAmount((requested - expected).toString()) : null;
  const sourceHash = primaryAttempt?.transaction_hash && /^0x[\da-fA-F]{64}$/.test(primaryAttempt.transaction_hash) ? primaryAttempt.transaction_hash : null;
  const sourceHref = sourceHash ? explorer(primaryAttempt?.source_network, "tx", sourceHash) : null;
  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key); setNotice("Copied to clipboard.");
    } catch { setNotice("Copy is blocked here. Select the value and copy it manually."); }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setCopiedKey(""); setNotice(""); }, 2600);
  }
  function valueActions(value: string, key: string, kind?: "tx" | "address", networkOverride?: string | null) {
    const href = kind ? explorer(networkOverride ?? network, kind, value) : null;
    return <span className="ac"><button className={`ib${copiedKey === key ? " ok" : ""}`} type="button" onClick={() => void copy(value, key)} aria-label={`Copy ${key}`} title="Copy"><MerchantIcon name={copiedKey === key ? "check" : "copy"} /></button>
      {href && <a className="ib" href={href} target="_blank" rel="noopener noreferrer" aria-label={`View ${key} on explorer`} title={(networkOverride ?? network) === "arbitrum-sepolia" ? "View on Arbiscan" : "View on explorer"}><MerchantIcon name="ext" /></a>}</span>;
  }
  return <div className="merchant-design" data-state="paid"><main className="page">
    <div className="nav"><Link className="back" href="/dashboard/invoices"><MerchantIcon name="back" />Back to invoices</Link><span className="sync" role="status"><i /><span>Live · updated {dateTime(invoice.updated_at)}</span></span></div>
    <section className="card hd"><div><h1><span className="n">#{invoice.invoice_number}</span><span className="st p" data-s="paid"><i />Paid</span></h1>
      <p className="sub" data-s="paid">Issued {formatUtcDate(invoice.issue_date)} · Settled {paidAt ? formatUtcDate(paidAt) : "Unavailable"} · {verified ? "Funds released to your wallet" : "Receipt data may still be loading"}</p></div>
      <div className="acts"><InvoicePrintButton className="btn"><MerchantIcon name="print" />Print / Save PDF</InvoicePrintButton></div>
    </section>
    <section className="card amt"><div><p className="lab" data-s="paid">Amount received</p><div className="big">{receivedAmount(primarySettlement?.received_amount_base_units, primarySettlement?.received_asset_decimals)}<small>{asset}</small></div></div><span className="net"><i />{networkName}</span></section>
    <section className="ban" data-s="paid" role="status"><span className="c"><MerchantIcon name="check" style={{ width: 18, height: 18, strokeWidth: 2.2 }} /></span><div><b>{verified ? "Payment Verified On-Chain" : "Payment receipt unavailable"}</b><span>{verified ? `Destination settlement independently confirmed on ${networkName}. Funds are in your receiving wallet.` : "Paid status is recorded only after verified settlement. Receipt data may still be loading."}</span></div></section>
    <section className="card" data-s="paid"><h2 style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 700 }}>On-chain settlement verification</h2><dl className="kv">
      <div><dt>Receipt number</dt><dd>{primaryReceipt?.receipt_number ? `#${primaryReceipt.receipt_number}` : "Unavailable"}</dd>{primaryReceipt?.receipt_number ? valueActions(primaryReceipt.receipt_number, "receipt number") : <span />}</div>
      <div><dt>Settlement timestamp</dt><dd>{dateTime(paidAt)}</dd><span /></div>
      {payer && <div><dt>Paid from wallet</dt><dd title={payer}>{shortHash(payer)}</dd>{valueActions(payer, "payer wallet address", "address", primaryAttempt?.source_network ?? network)}</div>}
      {hashes.length ? hashes.map((hash, index) => <div key={hash}><dt>Destination transaction hash{index > 0 ? ` ${index + 1}` : ""}</dt><dd>{shortHash(hash)}</dd>{valueActions(hash, "transaction hash", "tx")}</div>) : <div><dt>Destination transaction hash</dt><dd>Unavailable</dd><span /></div>}
      {contract && <div><dt>Escrow smart contract</dt><dd>{shortHash(contract)}</dd>{valueActions(contract, "contract address", "address")}</div>}
    </dl></section>
    <CustomerFeedback invoiceId={invoice.id} customerName={invoice.customer_name} />
    <MerchantInvoiceSummary invoice={invoice} seller={{ ...seller, receiving_address: primarySettlement?.recipient_address ?? seller.receiving_address }} paid />
    <details className="card"><summary>Technical payment details</summary><dl className="kv">
      <div><dt>Payment mode</dt><dd>{primaryAttempt?.mode === "mock" ? "Mock / Demo" : primaryAttempt?.mode === "live" ? "Live" : "Unavailable"}</dd><span /></div>
      <div><dt>Source asset</dt><dd>{primaryAttempt?.source_asset_id ?? "Unavailable"}</dd><span /></div>
      <div><dt>Source network</dt><dd>{primaryAttempt?.source_network ? getWalletNetwork(primaryAttempt.source_network)?.label ?? primaryAttempt.source_network : "Unavailable"}</dd><span /></div>
      <div><dt>Destination asset</dt><dd>{primarySettlement?.destination_asset_id ?? "Unavailable"}</dd><span /></div>
      <div><dt>Destination network</dt><dd>{networkName}</dd><span /></div>
      <div><dt>Payer debit</dt><dd>{sourceUsdc ? usdcBaseAmount(primaryAttempt?.requested_amount) ? `${usdcBaseAmount(primaryAttempt?.requested_amount)} USDC` : "Unavailable" : primaryAttempt?.requested_amount ? `${primaryAttempt.requested_amount} base units` : "Unavailable"}</dd><span /></div>
      <div><dt>Circle fees</dt><dd>{circleFee ? `${circleFee} USDC` : "Unavailable"}</dd><span /></div>
      <div><dt>Payer wallet address</dt><dd>{payer ?? "Unavailable"}</dd>{payer ? valueActions(payer, "payer wallet address") : <span />}</div>
      <div><dt>Merchant wallet address</dt><dd>{primarySettlement?.recipient_address ?? "Unavailable"}</dd><span /></div>
      <div><dt>Source transaction</dt><dd>{sourceHash ? sourceHref ? <a href={sourceHref} target="_blank" rel="noopener noreferrer">{shortHash(sourceHash)}</a> : sourceHash : "Unavailable"}</dd><span /></div>
      <div><dt>Destination transaction</dt><dd>{hashes.length ? hashes.map(hash => <p key={hash}>{hash}</p>) : "Unavailable"}</dd><span /></div>
      <div><dt>Settlement timestamp</dt><dd>{dateTime(paidAt)}</dd><span /></div>
      <div><dt>Settlement outcome</dt><dd>{primarySettlement?.outcome ?? "Unavailable"}</dd><span /></div>
    </dl></details>
    {receipts && receipts.length > 1 && <MerchantReceiptHistory receipts={receipts} settlements={settlements} title="All payment receipts" />}
  </main><div className={`toast${notice ? " on" : ""}`} role="status" aria-live="polite">{notice}</div></div>;
}
