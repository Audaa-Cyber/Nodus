"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { generateInvoiceShareLinkAction, revokeInvoiceShareLinkAction } from "@/app/actions/sharing";
import { formatUtcDate } from "@/lib/invoices";

type ShareState = "active" | "expired" | "none";

export default function InvoiceSharePanel({ invoiceId, shareState, expiresAt, canShare }: { invoiceId: string; shareState: ShareState; expiresAt: string | null; canShare: boolean }) {
  const [url, setUrl] = useState("");
  const [currentShareState, setCurrentShareState] = useState(shareState);
  const [currentExpiry, setCurrentExpiry] = useState(expiresAt);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const qrFrame = useRef<HTMLDivElement>(null);

  async function generateLink() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await generateInvoiceShareLinkAction(invoiceId);
      if (result.error) setError(result.error);
      else if (result.url) {
        setUrl(result.url);
        setCurrentShareState("active");
        setCurrentExpiry(result.expiresAt ?? null);
        setNotice("A new share link is ready. Any previous link has been replaced.");
      }
    } catch {
      setError("A share link could not be created. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function revokeLink() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await revokeInvoiceShareLinkAction(invoiceId);
      if (result.error) setError(result.error);
      else {
        setUrl("");
        setCurrentShareState("none");
        setCurrentExpiry(null);
        setNotice(result.success ?? "Share link revoked.");
      }
    } catch {
      setError("The share link could not be revoked. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Invoice link copied.");
      setError("");
    } catch {
      setError("Copy is unavailable in this browser. Select and copy the link below.");
    }
  }

  function downloadQr() {
    const svg = qrFrame.current?.querySelector("svg");
    if (!svg) return;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `nodus-invoice-qr.svg`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  return <section className="share-panel" aria-labelledby="share-invoice-heading">
    <div className="share-panel-heading"><div><p className="eyebrow">CUSTOMER ACCESS</p><h2 id="share-invoice-heading">Share invoice</h2></div>{currentShareState === "active" && <span className="status status-open">Link active</span>}</div>
    {currentShareState === "active" && !url && <p className="form-help">An active link is saved. To copy it again, generate a replacement; the previous link will stop working. This link expires {currentExpiry ? formatUtcDate(currentExpiry) : "after one year"}.</p>}
    {currentShareState === "expired" && !url && <p className="form-help">The previous link has expired. Generate a new link to share this invoice.</p>}
    {currentShareState === "none" && !url && (canShare
      ? <p className="form-help">Create a secure public link and QR code for the customer to view this invoice.</p>
      : <p className="form-help">This draft has no public link yet. <Link className="share-issue-link" href={`/dashboard/invoices/${invoiceId}/edit`}>Open the draft to issue it</Link>, then create its share link here.</p>)}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    <div className="share-actions">
      <button className="button button-dark" type="button" onClick={generateLink} disabled={pending || !canShare}>
        {pending && <span className="button-spinner" aria-hidden="true" />}
        {pending ? "Working…" : url || currentShareState === "active" ? "Generate replacement link" : "Generate share link"}
      </button>
      {currentShareState === "active" && !url && <button className="button button-outline" type="button" onClick={revokeLink} disabled={pending}>Revoke current link</button>}
    </div>
    {url && <div className="share-result">
      <label className="business-form share-url-field"><span>Public invoice URL</span><input value={url} readOnly onFocus={(event) => event.currentTarget.select()} aria-label="Public invoice URL" /></label>
      <div className="share-actions"><button className="button button-outline" type="button" onClick={copyLink}>Copy link</button><a className="button button-outline" href={url} target="_blank" rel="noopener noreferrer">Open public page</a><button className="button button-outline" type="button" onClick={downloadQr}>Download QR</button><button className="button button-outline" type="button" onClick={revokeLink} disabled={pending}>Revoke link</button></div>
      <div className="share-qr-wrap"><div className="share-qr" ref={qrFrame}><QRCodeSVG value={url} size={224} level="M" marginSize={4} title="QR code for the public invoice page" /></div><p>Scan to open this invoice on a phone. Link expires in one year.</p></div>
    </div>}
  </section>;
}
