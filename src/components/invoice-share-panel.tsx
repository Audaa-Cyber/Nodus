"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { generateInvoiceShareLinkAction } from "@/app/actions/sharing";
import { MerchantIcon } from "@/components/merchant-icon";
import { isActiveMerchantShare, resolveMerchantShareUrl } from "@/components/merchant-share-state";

export interface InvoiceSharePanelProps {
  invoiceId: string;
  invoiceNumber?: string;
  shareState: "active" | "expired" | "none";
  expiresAt: string | null;
  canShare: boolean;
  initialUrl?: string;
}

function sanitizeUrl(targetUrl: string) {
  if (typeof window === "undefined" || !targetUrl) return targetUrl;
  try {
    const parsed = new URL(targetUrl);
    if ((parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") return `${window.location.origin}${parsed.pathname}${parsed.search}`;
  } catch { return ""; }
  return targetUrl;
}

export default function InvoiceSharePanel({ invoiceId, invoiceNumber, shareState, expiresAt, canShare, initialUrl }: InvoiceSharePanelProps) {
  const router = useRouter();
  const [url, setUrl] = useState(() => resolveMerchantShareUrl(shareState, expiresAt, initialUrl));
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const memoryLink = useRef({ url: resolveMerchantShareUrl(shareState, expiresAt, initialUrl), expiresAt });
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleUrl = isActiveMerchantShare(shareState, expiresAt) ? url : "";

  useEffect(() => {
    const storageKey = `nodus:invoice-qr:${invoiceId}`;
    let cached: unknown;
    try {
      const raw = localStorage.getItem(storageKey);
      cached = raw ? JSON.parse(raw) : null;
    } catch { cached = null; }
    const restoredUrl = sanitizeUrl(resolveMerchantShareUrl(shareState, expiresAt, initialUrl, cached) || resolveMerchantShareUrl(shareState, expiresAt, undefined, memoryLink.current));
    memoryLink.current = { url: restoredUrl, expiresAt };
    setUrl(restoredUrl);
    setCopied(false);
    try {
      if (restoredUrl) localStorage.setItem(storageKey, JSON.stringify({ url: restoredUrl, expiresAt }));
      else localStorage.removeItem(storageKey);
    } catch { /* Server state still governs the visible link when storage is unavailable. */ }
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    function expire() {
      const remaining = expiresAt ? Date.parse(expiresAt) - Date.now() : 0;
      if (remaining > 0) { expiryTimer = setTimeout(expire, Math.min(remaining, 2_147_483_647)); return; }
      setUrl(""); setCopied(false); memoryLink.current = { url: "", expiresAt };
      try { localStorage.removeItem(storageKey); } catch { /* No cached link to restore. */ }
    }
    if (restoredUrl && expiresAt) expiryTimer = setTimeout(expire, Math.min(Math.max(0, Date.parse(expiresAt) - Date.now()), 2_147_483_647));
    return () => { if (expiryTimer) clearTimeout(expiryTimer); };
  }, [invoiceId, initialUrl, shareState, expiresAt]);
  useEffect(() => () => { if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current); }, []);

  async function generateLink() {
    if (pending || !canShare) return;
    setPending(true); setError(""); setNotice("");
    try {
      const result = await generateInvoiceShareLinkAction(invoiceId);
      if (result.error) setError(result.error);
      else if (result.url && isActiveMerchantShare("active", result.expiresAt ?? null)) {
        const cleanUrl = sanitizeUrl(result.url);
        memoryLink.current = { url: cleanUrl, expiresAt: result.expiresAt ?? null };
        setUrl(cleanUrl);
        try { localStorage.setItem(`nodus:invoice-qr:${invoiceId}`, JSON.stringify({ url: cleanUrl, expiresAt: result.expiresAt })); } catch { /* The generated URL stays in memory when storage is unavailable. */ }
        router.refresh();
      } else setError("A share link could not be created. Please try again.");
    } catch { setError("A share link could not be created. Please try again."); }
    finally { setPending(false); }
  }

  async function copyLink() {
    if (!visibleUrl) return;
    try {
      try { await navigator.clipboard.writeText(visibleUrl); }
      catch {
        const field = document.createElement("textarea");
        field.value = visibleUrl; field.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(field); field.select();
        const success = document.execCommand("copy"); field.remove();
        if (!success) throw new Error("Clipboard unavailable");
      }
      setCopied(true); setNotice("Payment link copied to clipboard ✓"); setError("");
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => { setNotice(""); setCopied(false); }, 2500);
    } catch { setError("Unable to copy link to clipboard."); }
  }

  return <>
    <section className="card sh no-print" data-s="open" aria-labelledby="share-invoice-heading">
      <div><h2 id="share-invoice-heading">Share with your customer</h2>
        <p className="d">Send this public payment link. The customer pays in USDC and the funds are held in escrow until settlement.</p>
        {visibleUrl ? <><p className="lab">Public payment link</p><div className="lk"><input className="m" readOnly value={visibleUrl} aria-label="Public payment link" onFocus={event => event.currentTarget.select()} /><button className={`cp${copied ? " ok" : ""}`} type="button" onClick={() => void copyLink()} aria-label="Copy payment link"><MerchantIcon name={copied ? "check" : "copy"} /><span>{copied ? "Copied" : "Copy Link"}</span></button></div></> : <>
          {!canShare ? <p className="d">This draft has no public link yet. <Link href={`/dashboard/invoices/${invoiceId}/edit`}>Open the draft to issue it</Link>, then create its share link here.</p> : <p className="d">{shareState === "expired" || shareState === "active" && !isActiveMerchantShare(shareState, expiresAt) ? "The previous link has expired. Generate a new QR code to accept payments." : shareState === "active" ? "An active link exists on the server. Generate or restore the QR code to display it." : "Create a secure payment link and QR code for the customer to pay this invoice."}</p>}
          <div className="acts"><button className="cp" type="button" onClick={() => void generateLink()} disabled={pending || !canShare}>{pending ? "Working…" : "Generate QR code"}</button></div>
        </>}
      </div>
      {visibleUrl && <div className="qr"><div><QRCodeSVG className="q" value={visibleUrl} size={148} level="M" marginSize={4} bgColor="#ffffff" fgColor="#000000" title={`Scan to pay invoice ${invoiceNumber ?? ""}`} /></div><span><MerchantIcon name="qrc" />Scan to pay on mobile</span></div>}
    </section><div className={`toast${notice || error ? " on" : ""}`} role={error ? "alert" : "status"} aria-live="polite">{error || notice}</div>
  </>;
}
