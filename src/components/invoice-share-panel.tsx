"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { generateInvoiceShareLinkAction, revokeInvoiceShareLinkAction } from "@/app/actions/sharing";

export interface InvoiceSharePanelProps {
  invoiceId: string;
  invoiceNumber?: string;
  shareState: "active" | "expired" | "none";
  expiresAt: string | null;
  canShare: boolean;
  initialUrl?: string;
}

export default function InvoiceSharePanel({
  invoiceId,
  invoiceNumber,
  shareState,
  expiresAt,
  canShare,
  initialUrl,
}: InvoiceSharePanelProps) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [currentShareState, setCurrentShareState] = useState<"active" | "expired" | "none">(
    initialUrl ? "active" : shareState
  );
  const [, setCurrentExpiry] = useState<string | null>(expiresAt);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShareWeb, setCanShareWeb] = useState(false);
  const qrFrame = useRef<HTMLDivElement>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function sanitizeUrl(targetUrl: string): string {
    if (typeof window === "undefined" || !targetUrl) return targetUrl;
    try {
      const parsed = new URL(targetUrl);
      if (
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1"
      ) {
        return `${window.location.origin}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      // fallback to original
    }
    return targetUrl;
  }
  // State & Local Storage Persistence (Refresh Safety)
  useEffect(() => {
    const storageKey = `nodus:invoice-qr:${invoiceId}`;
    if (initialUrl) {
      const cleanUrl = sanitizeUrl(initialUrl);
      setUrl(cleanUrl);
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ url: cleanUrl, expiresAt })
        );
      } catch {
        // Safe fallback if localStorage is unavailable
      }
    } else if (shareState === "active") {
      try {
        const cachedRaw = localStorage.getItem(storageKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached && typeof cached.url === "string" && cached.url) {
            const isExpired =
              cached.expiresAt && new Date(cached.expiresAt).getTime() <= Date.now();
            if (!isExpired) {
              const cleanUrl = sanitizeUrl(cached.url);
              setUrl(cleanUrl);
              setCurrentShareState("active");
              if (cached.expiresAt) setCurrentExpiry(cached.expiresAt);
            }
          }
        }
      } catch {
        // Safe fallback if JSON parse fails
      }
    }
  }, [invoiceId, initialUrl, shareState, expiresAt]);

  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      setCanShareWeb(true);
    }
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  async function generateLink() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await generateInvoiceShareLinkAction(invoiceId);
      if (result.error) {
        setError(result.error);
      } else if (result.url) {
        setUrl(result.url);
        setCurrentShareState("active");
        setCurrentExpiry(result.expiresAt ?? null);
        try {
          localStorage.setItem(
            `nodus:invoice-qr:${invoiceId}`,
            JSON.stringify({ url: result.url, expiresAt: result.expiresAt ?? null })
          );
        } catch {
          // ignore
        }
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
      if (result.error) {
        setError(result.error);
      } else {
        setUrl("");
        setCurrentShareState("none");
        setCurrentExpiry(null);
        try {
          localStorage.removeItem(`nodus:invoice-qr:${invoiceId}`);
        } catch {
          // ignore
        }
        setNotice(result.success ?? "Share link revoked.");
      }
    } catch {
      setError("The share link could not be revoked. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setNotice("Payment link copied to clipboard ✓");
      setError("");
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => {
        setNotice("");
        setCopied(false);
      }, 2500);
    } catch {
      setError("Unable to copy link to clipboard.");
    }
  }

  function downloadQr() {
    const svg = qrFrame.current?.querySelector("svg");
    if (!svg) return;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    const filename = invoiceNumber
      ? `nodus-invoice-${invoiceNumber}-qr.svg`
      : `nodus-invoice-qr.svg`;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  async function handleShare() {
    if (!url || typeof navigator === "undefined" || !navigator.share) return;
    try {
      await navigator.share({
        title: `Invoice ${invoiceNumber ?? ""}`.trim(),
        url,
      });
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setError("Could not share invoice link.");
      }
    }
  }

  return (
    <section className="share-panel invoice-share-panel no-print" aria-labelledby="share-invoice-heading">
      <div className="share-panel-heading">
        <div>
          <p className="eyebrow">CUSTOMER ACCESS</p>
          <h2 id="share-invoice-heading">Scan to Pay</h2>
        </div>
        {currentShareState === "active" && <span className="status status-open">Link active</span>}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}

      {!url && (
        <>
          {currentShareState === "none" && !canShare ? (
            <p className="form-help">
              This draft has no public link yet.{" "}
              <Link className="share-issue-link" href={`/dashboard/invoices/${invoiceId}/edit`}>
                Open the draft to issue it
              </Link>
              , then create its share link here.
            </p>
          ) : (
            <p className="form-help">
              {currentShareState === "expired"
                ? "The previous link has expired. Generate a new QR code to accept payments."
                : currentShareState === "active"
                  ? "An active link exists on the server. Generate or restore the QR code to display it."
                  : "Create a secure payment link and QR code for the customer to pay this invoice."}
            </p>
          )}

          <div className="share-actions">
            <button
              className="button button-dark"
              type="button"
              onClick={generateLink}
              disabled={pending || !canShare}
            >
              {pending && <span className="button-spinner" aria-hidden="true" />}
              {pending ? "Working…" : "Generate QR code"}
            </button>
            {currentShareState === "active" && (
              <button
                className="button button-outline"
                type="button"
                onClick={revokeLink}
                disabled={pending}
              >
                Revoke link
              </button>
            )}
          </div>
        </>
      )}

      {url && (
        <div className="share-result">
          <div className="qr-hero-card">
            <span className="qr-badge">SCAN TO PAY</span>
            <div className="qr-frame" ref={qrFrame}>
              <QRCodeSVG
                value={url}
                size={260}
                level="M"
                marginSize={4}
                bgColor="#ffffff"
                fgColor="#171816"
                title={`Scan to pay invoice ${invoiceNumber ?? ""}`}
              />
            </div>
            <p className="qr-instructions">
              Scan with any mobile phone camera or crypto wallet to pay.
            </p>
          </div>

          <div className="share-actions">
            <button
              className="button button-dark"
              type="button"
              onClick={copyLink}
              aria-label="Copy payment link"
            >
              {copied ? (
                <>
                  <span aria-hidden="true" style={{ marginRight: 6 }}>✓</span>
                  Copied!
                </>
              ) : (
                "Copy payment link"
              )}
            </button>
            <button className="button button-outline" type="button" onClick={downloadQr}>
              Download QR
            </button>
            {canShareWeb && (
              <button className="button button-outline" type="button" onClick={handleShare}>
                Share
              </button>
            )}
            <button
              className="button button-outline"
              type="button"
              onClick={generateLink}
              disabled={pending}
            >
              {pending ? "Working…" : "Regenerate link"}
            </button>
            <button
              className="button button-outline button-danger-quiet"
              type="button"
              onClick={revokeLink}
              disabled={pending}
            >
              Revoke link
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
