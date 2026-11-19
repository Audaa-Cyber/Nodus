"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { InvoiceWalletCheckoutProps } from "@/components/wallet/invoice-wallet-checkout";
import { LazyInvoiceWalletCheckout } from "@/components/wallet/lazy-wallet-checkout";

declare global {
  interface Window {
    html2canvas?: (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function loadHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;
  const existing = document.querySelector<HTMLScriptElement>("script[data-nodus-html2canvas]");
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Receipt download could not be prepared.")), { once: true });
    });
  } else {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      script.async = true;
      script.dataset.nodusHtml2canvas = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Receipt download could not be prepared."));
      document.head.appendChild(script);
    });
  }
  if (!window.html2canvas) throw new Error("Receipt download could not be prepared.");
  return window.html2canvas;
}

export function PayerInvoiceFrame({
  children,
  checkout,
  isPaid = false,
  shareToken,
}: {
  children: ReactNode;
  checkout: InvoiceWalletCheckoutProps | null;
  isPaid?: boolean;
  shareToken?: string;
}) {
  const paperRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [printed, setPrinted] = useState(false);
  const [paid, setPaid] = useState(isPaid);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [tearing, setTearing] = useState(false);
  const [falling, setFalling] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    setPaid(isPaid);
  }, [isPaid]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const paper = paperRef.current;
      const paperWindow = windowRef.current;
      if (!paper || !paperWindow) return;
      const height = Math.ceil(paper.scrollHeight + 14);
      paperWindow.style.height = "0px";
      void paperWindow.offsetHeight;
      topRef.current?.classList.add("printing");
      bottomRef.current?.classList.add("printing");
      paperWindow.classList.add("printing");
      const feedSteps = [0.07, 0.15, 0.25, 0.36, 0.47, 0.58, 0.69, 0.80, 0.90, 1];
      for (let index = 0; index < feedSteps.length; index += 1) {
        if (cancelled) return;
        paperWindow.style.height = `${Math.round(height * feedSteps[index])}px`;
        await wait(index === 0 ? 190 : 145);
        if (index !== feedSteps.length - 1) await wait(index % 2 === 0 ? 105 : 85);
      }
      await wait(250);
      if (cancelled) return;
      topRef.current?.classList.remove("printing");
      bottomRef.current?.classList.remove("printing");
      setPrinted(true);
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      topRef.current?.classList.remove("printing");
      bottomRef.current?.classList.remove("printing");
    };
  }, []);

  const onSettled = useCallback(() => setPaid(true), []);

  async function tearAndDownload() {
    if (!paperRef.current || tearing) return;
    setDownloadError("");
    setTearing(true);
    await wait(750);
    try {
      const capture = await loadHtml2Canvas();
      const canvas = await capture(paperRef.current, {
        backgroundColor: "#fafafa",
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: false,
        scrollX: 0,
        scrollY: 0,
      });
      setFalling(true);
      const link = document.createElement("a");
      link.download = `Nodus-Receipt-${(shareToken ?? "payment").slice(0, 12)}.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      link.remove();
      await wait(900);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "The receipt could not be downloaded.");
    } finally {
      setFalling(false);
      setTearing(false);
    }
  }

  return (
    <div className="payer-design">
      <div className="wrap">
        <main className="receipt-print-experience">
          <div className="receipt-printer-stage">
            <div className="receipt-printer-slot receipt-slot-top" ref={topRef} aria-hidden="true" />
            <div className={`receipt-paper-window${tearing ? " tearing" : ""}`} ref={windowRef}>
              <div className={`receipt-paper-capture${falling ? " torn-away" : ""}`} ref={paperRef}>
                {children}
                {paid && printed && (
                  <div className="receipt-advance-stamp" aria-label="Paid">
                    PAID
                    <small>{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}</small>
                  </div>
                )}
              </div>
              <div className="receipt-tear-perforation" aria-hidden="true" />
              <div className="receipt-tear-rip" aria-hidden="true" />
              <div className="receipt-paper-stub" aria-hidden="true" />
            </div>
            <div className="receipt-printer-slot receipt-slot-bottom" ref={bottomRef} aria-hidden="true" />
          </div>

          {printed && !paid && checkout && (
            <button className="receipt-action-button" type="button" onClick={() => setCheckoutOpen(true)}>
              Pay now
            </button>
          )}
          {printed && paid && (
            <button className="receipt-action-button" type="button" onClick={() => void tearAndDownload()} disabled={tearing}>
              {tearing ? "Preparing receipt…" : "Tear & Download"}
            </button>
          )}
          {downloadError && <p className="receipt-download-error" role="alert">{downloadError}</p>}
          {checkout && checkoutOpen && !paid && (
            <LazyInvoiceWalletCheckout {...checkout} autoOpen onSettled={onSettled} />
          )}
        </main>
      </div>
    </div>
  );
}
