"use client";

import { useEffect, useId, useRef, useState } from "react";
import { InvoiceRating } from "@/components/invoice-feedback";
import { getWalletNetwork, evmWalletChains } from "@/lib/wallet/networks";
import { mountApprovedScroll } from "./scroll-motion";

export type ReceiptInfo = {
  receipt_number?: string | null;
  invoice_number?: string | null;
  business_name?: string | null;
  outcome?: string | null;
  destination_network?: string | null;
  destination_asset_id?: string | null;
  recipient_address?: string | null;
  received_amount_base_units?: string | null;
  received_asset_decimals?: number | null;
  destination_tx_hashes?: string[] | unknown;
  issued_at?: string | null;
};

export type LineItem = {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
};

export type PaymentSuccessCardProps = {
  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  businessName?: string | null;
  logoUrl?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  destinationNetwork?: string | null;
  recipientAddress?: string | null;
  receipt?: ReceiptInfo | null;
  receipts?: ReceiptInfo[] | null;
  lineItems?: LineItem[] | null;
  subtotalMinor?: number | null;
  taxRateBps?: number | null;
  discountMinor?: number | null;
  sellerFooter?: string | null;
  sellerDetails?: {
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    website?: string | null;
    taxId?: string | null;
    founderName?: string | null;
    founderTitle?: string | null;
    reviewUrl?: string | null;
  } | null;
  reviewSlot?: React.ReactNode;
  shareToken?: string;
};

function shortValue(value: string | null | undefined) {
  if (!value) return "Unavailable";
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function receiptAmount(receipt: ReceiptInfo | null, amountMinor: number) {
  const value = receipt?.received_amount_base_units;
  const decimals = receipt?.received_asset_decimals;
  if (value && /^\d+$/.test(value) && typeof decimals === "number" && Number.isInteger(decimals) && decimals >= 0 && decimals <= 30) {
    const padded = value.padStart(decimals + 1, "0");
    const whole = decimals ? padded.slice(0, -decimals) : padded;
    const fraction = decimals ? padded.slice(-decimals).replace(/0+$/, "") : "";
    return `${BigInt(whole).toLocaleString("en-US")}.${fraction.padEnd(2, "0")}`;
  }
  return (amountMinor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function receiptDate(date: string | null | undefined) {
  if (!date || !Number.isFinite(Date.parse(date))) return { day: "Date unavailable", time: "Time unavailable" };
  const value = new Date(date);
  return {
    day: value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
    time: value.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" }) + " UTC",
  };
}

function ScrollDefinitions({ prefix }: { prefix: string }) {
  const gold = `url(#${prefix}-goldH)`, shine = `url(#${prefix}-ballShine)`;
  return <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${prefix}-goldH`} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#6a4616" /><stop offset=".2" stopColor="#bf8c3a" /><stop offset=".42" stopColor="#fff3c4" /><stop offset=".62" stopColor="#d6a64e" /><stop offset=".85" stopColor="#94651f" /><stop offset="1" stopColor="#5e3d12" />
      </linearGradient>
      <radialGradient id={`${prefix}-ballShine`} cx=".36" cy=".3" r=".7">
        <stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset=".25" stopColor="#fff" stopOpacity=".25" /><stop offset="1" stopColor="#3a2000" stopOpacity=".45" />
      </radialGradient>
      <symbol id={`${prefix}-finial`} viewBox="0 0 48 44">
        <rect x="9" y="35" width="30" height="9" fill={gold} />
        <rect x="4" y="28" width="40" height="8" rx="4" fill={gold} />
        <rect x="17" y="22" width="14" height="7" fill={gold} />
        <circle cx="24" cy="12.5" r="11" fill={gold} />
        <circle cx="24" cy="12.5" r="11" fill={shine} />
        <rect x="4" y="30.5" width="40" height="1.2" fill="#fff4c8" opacity=".6" />
      </symbol>
      <symbol id={`${prefix}-i-mail`} viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></symbol>
      <symbol id={`${prefix}-i-phone`} viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></symbol>
      <symbol id={`${prefix}-i-pin`} viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></symbol>
      <symbol id={`${prefix}-i-shield`} viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 4.5 3.4 7.8 8 9 4.6-1.2 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></symbol>
      <symbol id={`${prefix}-i-dl`} viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 20h14" /></symbol>
      <symbol id={`${prefix}-i-roll`} viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4" /></symbol>
    </defs>
  </svg>;
}

export function PaymentSuccessCard({
  invoiceNumber, amountMinor, businessName, destinationNetwork, recipientAddress,
  receipt, receipts, sellerFooter, sellerDetails, reviewSlot, shareToken,
}: PaymentSuccessCardProps) {
  const prefix = useId().replace(/:/g, "");
  const scrollRef = useRef<HTMLDivElement>(null), paperRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null), curlRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null), rightRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloads = useRef(new Set<string>());
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false), downloading = useRef(false);
  const [notice, setNotice] = useState(""), [preparing, setPreparing] = useState(false);

  useEffect(() => {
    mounted.current = true;
    const activeDownloads = downloads.current;
    const cleanup = mountApprovedScroll({ scroll: scrollRef.current!, paper: paperRef.current!, sheet: sheetRef.current!, curl: curlRef.current!, leftSpindle: leftRef.current!, rightSpindle: rightRef.current!, back: backRef.current! });
    return () => {
      mounted.current = false;
      cleanup(); request.current?.abort();
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      activeDownloads.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const candidates = [receipt, ...(receipts ?? [])].filter((candidate): candidate is ReceiptInfo => !!candidate);
  const activeReceipt = candidates.find(candidate => candidate.outcome === "VERIFIED" || candidate.outcome === "OVERPAID")
    ?? candidates.find(candidate => !candidate.outcome) ?? null;
  const merchant = activeReceipt?.business_name || businessName || "Merchant";
  const networkKey = activeReceipt?.destination_network || destinationNetwork;
  const network = networkKey ? getWalletNetwork(networkKey) : null;
  const networkName = network?.label || networkKey || "network unavailable";
  const amount = receiptAmount(activeReceipt, amountMinor);
  const date = receiptDate(activeReceipt?.issued_at);
  const hashes = Array.isArray(activeReceipt?.destination_tx_hashes)
    ? activeReceipt.destination_tx_hashes.filter((hash): hash is string => typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash)) : [];
  const txHash = hashes[0] ?? null;
  const chain = evmWalletChains.find(candidate => candidate.id === network?.chainId);
  const explorerUrl = txHash && chain?.blockExplorers?.default.url ? `${chain.blockExplorers.default.url}/tx/${txHash}` : null;
  const explorerName = chain?.blockExplorers?.default.name || "Explorer";
  const note = sellerFooter?.trim() || `Your payment of ${amount} USDC has settled on ${networkName}, and all of us at ${merchant} are deeply grateful for your trust. Your invoice is now sealed on-chain, and we look forward to making something remarkable together.`;

  function say(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => { if (mounted.current) setNotice(""); }, 2600);
  }

  async function downloadOfficialReceipt() {
    if (downloading.current) return;
    if (!shareToken) { window.print(); return; }
    downloading.current = true; setPreparing(true);
    request.current = new AbortController();
    try {
      const response = await fetch(`/api/pay/${encodeURIComponent(shareToken)}/receipt`, { cache: "no-store", signal: request.current.signal });
      if (response.status === 422) {
        const fallback = await response.json().catch(() => null);
        if (fallback?.code === "unicode_receipt_requires_print") {
          if (mounted.current) window.print();
          return;
        }
      }
      if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) {
        throw new Error("The official receipt is temporarily unavailable. Please try again.");
      }
      const blob = await response.blob();
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob); downloads.current.add(url);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `NODUS-Receipt-${invoiceNumber.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url); }, 1000);
      say(`Receipt for ${invoiceNumber} is ready.`);
    } catch (error) {
      if (mounted.current && !(error instanceof DOMException && error.name === "AbortError")) say(error instanceof Error ? error.message : "The receipt could not be downloaded.");
    } finally {
      downloading.current = false;
      if (mounted.current) setPreparing(false);
    }
  }

  const icon = (name: string) => <svg aria-hidden="true"><use href={`#${prefix}-i-${name}`} /></svg>;
  const finials = <><svg className="fin t" aria-hidden="true"><use href={`#${prefix}-finial`} /></svg><svg className="fin b" aria-hidden="true"><use href={`#${prefix}-finial`} /></svg></>;
  return <div className="scroll-design" role="region" aria-label="Payment receipt" data-receipt-number={activeReceipt?.receipt_number ?? undefined}>
    <ScrollDefinitions prefix={prefix} />
    <main className="stage">
      <div className="scroll" ref={scrollRef} data-state="closed" role="button" tabIndex={0} aria-expanded="false" aria-label="Unroll your thank-you scroll">
        <div className="ground" /><div className="core" />
        <div className="spindle" ref={leftRef}><div className="rod"><div className="shine" /></div>{finials}</div>
        <div className="paper" ref={paperRef}>
          <section className="sheet" ref={sheetRef} inert aria-label={`Thank you from ${merchant}`}>
            <header className="top">
              <div><div className="logo">nodus<b>.</b></div><div className="cap"><u>•</u> Decentralized Settlement Protocol</div></div>
              <div className="pill">● ON-CHAIN VERIFIED</div>
            </header>
            <h1>Thank You!</h1>
            <p className="note">{note}</p>
            <div className="dossier">
              <h2>{merchant} <span>Business owner dossier</span></h2>
              <div className="rows">
                <div className="row"><span className="ico">{icon("mail")}</span><div><small>Email</small>{sellerDetails?.email || "Unavailable"}</div></div>
                <div className="row"><span className="ico">{icon("phone")}</span><div><small>Phone</small>{sellerDetails?.phone || "Unavailable"}</div></div>
                <div className="row"><span className="ico">{icon("pin")}</span><div><small>Address</small>{sellerDetails?.address || "Unavailable"}</div></div>
                <div className="row"><span className="ico">{icon("shield")}</span><div><small>Tax ID / EIN</small>{sellerDetails?.taxId || "Unavailable"} <em>|</em> Payee: {shortValue(activeReceipt?.recipient_address ?? recipientAddress)}</div></div>
              </div>
            </div>
            <div className="amt"><strong>${amount} USDC</strong><i>•</i><span>Invoice: {invoiceNumber}</span><i>•</i><span>{date.day}</span><i>•</i><span>{date.time}</span></div>
            <InvoiceRating shareToken={shareToken} invoiceNumber={invoiceNumber} reviewUrl={sellerDetails?.reviewUrl ?? undefined} />
            {reviewSlot}
            <div className="sign">
              <div className="cur"><div className="s1">With warmest appreciation,</div><div className="s2">{sellerDetails?.founderName || merchant}</div><div className="s3">{sellerDetails?.founderTitle || "Authorized Signatory"}</div></div>
              <div className="tx">Settlement transaction<br />{explorerUrl ? <a href={explorerUrl} target="_blank" rel="noopener noreferrer">{shortValue(txHash)} ↗ {explorerName}</a> : <span>{txHash ? shortValue(txHash) : "Unavailable"}</span>}</div>
            </div>
            <div className="acts">
              <button className="btn pri" type="button" onClick={() => void downloadOfficialReceipt()} disabled={preparing}>{icon("dl")}<span>{preparing ? "Preparing receipt…" : "Download Official Receipt (PDF)"}</span></button>
              <button className="btn sec" ref={backRef} type="button">{icon("roll")}<span>Roll Back Up</span></button>
            </div>
          </section>
          <div className="shadeL" /><div className="curl" ref={curlRef} />
        </div>
        <div className="spindle" ref={rightRef} style={{ left: "var(--sp)" }}><div className="rod"><div className="shine" /></div>{finials}</div>
      </div>
      <div className="hint">Payment confirmed. Click the scroll to unroll your thank-you card.</div>
    </main>
    <div className={`toast${notice ? " on" : ""}`} role="status" aria-live="polite">{notice}</div>
  </div>;
}
