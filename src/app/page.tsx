"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  LockKeyhole,
  Menu,
  QrCode,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import DotMatrixHands from "@/components/dot-matrix-hands";

const methods = ["USDC · Ethereum", "USDC · Solana", "USDT · Ethereum"];

export default function Home() {
  const [method, setMethod] = useState(methods[0]);
  const [paymentState, setPaymentState] = useState<"idle" | "processing" | "paid">("idle");
  const [printing, setPrinting] = useState(false);
  const [items, setItems] = useState([
    { id: 1, name: "House espresso", price: 4.5, quantity: 1 },
    { id: 2, name: "Almond croissant", price: 6, quantity: 1 },
    { id: 3, name: "Still water", price: 2.5, quantity: 1 },
  ]);
  const paymentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const printTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const service = subtotal * 0.1;
  const total = subtotal + service;
  const formatUsd = (amount: number) => "$" + amount.toFixed(2);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
    if (paymentTimer.current) clearTimeout(paymentTimer.current);
    if (printTimer.current) clearTimeout(printTimer.current);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText("NODUS-INV-0248");
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const closeMenu = () => setMenuOpen(false);

  const updateQuantity = (id: number, delta: number) => {
    if (paymentTimer.current) clearTimeout(paymentTimer.current);
    setItems((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(1, Math.min(9, item.quantity + delta)) } : item));
    setPaymentState("idle");
  };

  const runDemoPayment = () => {
    if (paymentState !== "idle") return;
    setPaymentState("processing");
    paymentTimer.current = setTimeout(() => setPaymentState("paid"), 1900);
  };

  const downloadReceipt = () => {
    const rows = items.map((item) => "<tr><td>" + item.name + " × " + item.quantity + "</td><td>$" + (item.price * item.quantity).toFixed(2) + "</td></tr>").join("");
    const html = "<!doctype html><html><head><meta charset='utf-8'><title>Nodus payment receipt</title><style>*{box-sizing:border-box}body{margin:0;padding:32px;background:#f4f4f4;color:#171816;font:14px/1.5 Arial}.receipt{position:relative;width:360px;max-width:100%;margin:auto;padding:28px 24px;background:white}.stamp{position:absolute;right:18px;top:18px;transform:rotate(13deg);border:3px solid #27804a;border-radius:50%;padding:7px 10px;color:#27804a;font-weight:800;letter-spacing:2px;opacity:.78}h1{font-size:20px;letter-spacing:2px}table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:7px 0}td:last-child{text-align:right}.meta{margin:20px 0;border-block:1px dashed #bbb;padding:12px 0}.total{display:flex;justify-content:space-between;border-top:1px solid #222;padding-top:14px;font-weight:bold;font-size:17px}.foot{text-align:center;margin-top:28px;color:#666;font-size:12px}@media print{body{background:white;padding:0}}</style></head><body><main class='receipt'><div class='stamp'>PAID</div><h1>PAYMENT RECEIPT</h1><div>Maison Café · Addis Ababa</div><div class='meta'>Receipt no. <b>NODUS-0248</b><br>Date: " + new Date().toLocaleString() + "<br>Payment method: " + method + "<br>Payment status: PAID</div><table>" + rows + "<tr><td>Subtotal</td><td>$" + subtotal.toFixed(2) + "</td></tr><tr><td>Service · 10%</td><td>$" + service.toFixed(2) + "</td></tr></table><div class='total'><span>TOTAL PAID</span><span>$" + total.toFixed(2) + " USD</span></div><div class='meta'>Transaction reference<br><b>NODUS-DEMO-0248-7F3A</b></div><div class='foot'>Thank you for visiting Maison Café.<br>Simulated payment. No funds were transferred.</div></main></body></html>";
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "nodus-payment-receipt.html"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const printReceipt = () => {
    if (paymentState !== "paid" || printing) return;
    setPrinting(true);
    if ("vibrate" in navigator) navigator.vibrate([45, 35, 45, 35, 70]);
    try {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        const context = new AudioContextClass();
        [0, 150, 310, 490, 700].forEach((delay, index) => {
          const oscillator = context.createOscillator(); const gain = context.createGain();
          oscillator.type = "sawtooth"; oscillator.frequency.value = index % 2 ? 115 : 145;
          gain.gain.setValueAtTime(0.0001, context.currentTime + delay / 1000);
          gain.gain.exponentialRampToValueAtTime(0.03, context.currentTime + delay / 1000 + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay / 1000 + 0.11);
          oscillator.connect(gain); gain.connect(context.destination);
          oscillator.start(context.currentTime + delay / 1000); oscillator.stop(context.currentTime + delay / 1000 + 0.12);
        });
        window.setTimeout(() => void context.close(), 1200);
      }
    } catch { /* Printer audio is optional. */ }
    printTimer.current = setTimeout(() => { setPrinting(false); window.print(); }, 1450);
  };

  return (
    <main>
      <section className="hero" id="top">
        <nav className="nav shell" aria-label="Main navigation">
          <Link href="#top" className="brand" onClick={closeMenu} aria-label="Nodus home">
            <Image src="/logo.svg" alt="Nodus logo" width={331} height={213} style={{ height: "20px", width: "auto", display: "inline-block" }} aria-hidden="true" />
            <span>nodus<span className="brand-period">.</span></span>
          </Link>

          <div id="primary-navigation" className={menuOpen ? "nav-links is-open" : "nav-links"}>
            <Link href="#checkout" onClick={closeMenu}>Checkout demo</Link>
            <Link href="#how-it-works" onClick={closeMenu}>How it works</Link>
            <Link href="#business" onClick={closeMenu}>For business</Link>
            <Link href="/login?next=%2Fdashboard" prefetch={true} className="mobile-business-link" onClick={closeMenu}>Log in</Link>
            <Link href="/register?mode=signup" prefetch={true} className="mobile-business-link" onClick={closeMenu}>Create account</Link>
          </div>

          <div className="nav-right">
            <Link href="/login?next=%2Fdashboard" prefetch={true} className="nav-login">Log in</Link>
            <Link href="/register?mode=signup" prefetch={true} className="nav-cta nav-register">Create account <ArrowUpRight size={14} strokeWidth={1.7} aria-hidden="true" /></Link>
            <button
              className="menu-toggle"
              type="button"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              aria-controls="primary-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </nav>

        <div className="hero-copy shell">
          <h1>Itemized invoices.<br /><span>Payments made clear.</span></h1>
          <div className="hero-bottom">
            <p className="hero-lede">
              Nodus turns an itemized invoice into a QR checkout. Guests scan,
              choose a supported stablecoin, and approve payment from their wallet.
            </p>
            <div className="hero-actions">
              <Link href="#checkout" className="button button-dark">Explore checkout demo <ArrowUpRight size={15} strokeWidth={1.7} aria-hidden="true" /></Link>
              <Link href="/login?next=%2Fdashboard" className="button-link">Log in to dashboard <ArrowRight size={15} strokeWidth={1.6} aria-hidden="true" /></Link>
            </div>
          </div>
        </div>
      </section>

      <section className="checkout-section section-pad" id="checkout">
        <div className="shell checkout-layout">
          <div className="checkout-copy">
            <p className="eyebrow">THE CHECKOUT</p>
            <h2>Every item.<br />Every fee.<br /><span>One clear total.</span></h2>
            <p className="section-description">
              Guests see exactly what they are paying for, then choose a supported
              network and approve the transaction in their own wallet.
            </p>
            <p className="demo-disclaimer">INTERACTIVE PREVIEW · SIMULATED PAYMENT · NO REAL FUNDS MOVE</p>
          </div>

          <div className="invoice-stage">
            <div className="invoice-stage-heading">
              <span>GUEST CHECKOUT PREVIEW</span>
              <span>MAISON CAFÉ / TABLE 08</span>
            </div>
            <div className="invoice-card">
              <div className="invoice-top">
                <div>
                  <span className="micro-label">YOUR BILL FROM</span>
                  <h3>Maison Café</h3>
                  <p>Table 08 · Addis Ababa</p>
                </div>
                <div className="invoice-logo" aria-hidden="true">m.</div>
              </div>
              <div className="invoice-meta">
                <span>INVOICE <b>N° 0248</b></span>
                <button onClick={handleCopy} className="copy-id" type="button" aria-label="Copy invoice ID">
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy ID"}
                </button>
              </div>
              <div className="invoice-lines invoice-editable-lines">
                {items.map((item) => (
                  <div className="invoice-editable-row" key={item.id}>
                    <span className="invoice-item-name">{item.name}<small>{formatUsd(item.price)} each</small></span>
                    <div className="quantity-control" aria-label={item.name + " quantity"}>
                      <button type="button" onClick={() => updateQuantity(item.id, -1)} disabled={item.quantity <= 1} aria-label={"Decrease " + item.name + " quantity"}>−</button>
                      <span>{item.quantity}</span>
                      <button type="button" onClick={() => updateQuantity(item.id, 1)} disabled={item.quantity >= 9} aria-label={"Increase " + item.name + " quantity"}>+</button>
                    </div>
                    <b>{formatUsd(item.price * item.quantity)}</b>
                  </div>
                ))}
              </div>
              <button
                className="breakdown-toggle"
                type="button"
                onClick={() => setShowBreakdown((open) => !open)}
                aria-expanded={showBreakdown}
                aria-controls="invoice-breakdown"
              >
                <span>Subtotal and service</span>
                <ChevronDown size={14} className={showBreakdown ? "rotate" : ""} />
              </button>
              <div
                id="invoice-breakdown"
                className={showBreakdown ? "breakdown-clip is-open" : "breakdown-clip"}
                aria-hidden={!showBreakdown}
              >
                <div className="breakdown-detail">
                  <span>Subtotal <b>{formatUsd(subtotal)}</b></span>
                  <span>Service · 10% <b>{formatUsd(service)}</b></span>
                </div>
              </div>
              <div className="invoice-total">
                <span>Total due</span>
                <strong>{formatUsd(total)} <small>USD</small></strong>
              </div>
              <div className="pay-label">
                <span>PAY WITH</span>
                <span className="secure-label"><LockKeyhole size={11} /> PREVIEW ONLY</span>
              </div>
              <div className="method-select">
                <select
                  aria-label="Choose payment network"
                  value={method}
                  onChange={(event) => {
                    if (paymentTimer.current) clearTimeout(paymentTimer.current);
                    setMethod(event.target.value);
                    setPaymentState("idle");
                  }}
                >
                  {methods.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </div>
              <button className={paymentState === "paid" ? "pay-button is-paid" : "pay-button"} type="button" onClick={runDemoPayment} disabled={paymentState !== "idle"}>
                {paymentState === "processing" ? <><span className="demo-spinner" /> Processing payment…</> : paymentState === "paid" ? <><Check size={16} /> Payment successful</> : "Pay " + formatUsd(total)}
              </button>
              <div className={"payment-feedback " + (paymentState !== "idle" ? "is-visible" : "")} aria-live="polite">
                <span className="success-pulse" />
                {paymentState === "processing" ? "Checking the simulated transaction…" : paymentState === "paid" ? "Payment confirmed. Your receipt is ready." : "Demo only. No wallet is connected and no funds will move."}
              </div>
              {paymentState === "paid" && (
                <div className="demo-receipt-area">
                  <div className="receipt-printer-heading"><span>PAYMENT RECEIPT</span><span className="receipt-paid-chip"><Check size={11} /> PAID</span></div>
                  <div className={"receipt-printer " + (printing ? "is-printing" : "is-printed")}>
                    <div className="receipt-printer-mouth"><span /></div>
                    <div className="receipt-paper">
                      <div className="receipt-stamp">PAID</div>
                      <h4>Maison Café</h4><p>PAYMENT RECEIPT · N° 0248</p>
                      <div className="receipt-paper-rule" />
                      {items.map((item) => <div className="receipt-line" key={item.id}><span>{item.name} × {item.quantity}</span><b>{formatUsd(item.price * item.quantity)}</b></div>)}
                      <div className="receipt-line"><span>Subtotal</span><b>{formatUsd(subtotal)}</b></div>
                      <div className="receipt-line"><span>Service · 10%</span><b>{formatUsd(service)}</b></div>
                      <div className="receipt-paper-rule" />
                      <div className="receipt-line receipt-grand-total"><strong>TOTAL PAID</strong><strong>{formatUsd(total)}</strong></div>
                      <div className="receipt-payment-meta"><span>{method}</span><span>REF NODUS-DEMO-0248-7F3A</span><span>{new Date().toLocaleString()}</span></div>
                      <p className="receipt-thanks">Thank you for visiting.</p>
                    </div>
                    <div className="receipt-printer-lower"><span /></div>
                  </div>
                  <div className="receipt-actions">
                    <button type="button" onClick={printReceipt} disabled={printing}>{printing ? "Printing…" : "Print receipt"}</button>
                    <button type="button" onClick={downloadReceipt}>Download receipt</button>
                    <button type="button" className="receipt-reset" onClick={() => { setPaymentState("idle"); setPrinting(false); }}>Start again</button>
                  </div>
                  <p className="receipt-demo-note">Simulated transaction · No real funds transferred</p>
                </div>
              )}
              <div className="invoice-foot">
                <ShieldCheck size={13} />
                A real invoice should close only after settlement is verified.
              </div>
            </div>
            <p className="invoice-note">A preview of the guest experience. Network options are illustrative.</p>
          </div>
        </div>
      </section>

      <section className="statement-section">
        <div className="shell statement-layout">
          <p className="eyebrow">THE LAST PART OF THE EXPERIENCE</p>
          <div>
            <h2>A clear bill is<br />part of the <span>service.</span></h2>
            <p>
              Show guests each item and service charge before they pay. Keep the invoice connected to its payment record, so your team can confirm the outcome without matching separate receipts.
            </p>
          </div>
          <span className="statement-aside" aria-hidden="true">N / 0248</span>
        </div>
      </section>

      <section className="process-section section-pad" id="how-it-works">
        <div className="shell">
          <div className="process-heading">
            <div>
              <p className="eyebrow">HOW IT WORKS</p>
              <h2>From invoice<br /><span>to confirmation.</span></h2>
            </div>
            <p className="section-description">
              Create an itemized invoice, share its QR code, and keep payment status tied to verified settlement.
            </p>
          </div>

          <div className="process-list">
            <article className="process-item">
              <div className="process-visual bill-visual">
                <div className="paper-sheet">
                  <span className="paper-heading" />
                  <span />
                  <span />
                  <span className="paper-short" />
                  <i />
                </div>
              </div>
              <div className="process-content">
                <span className="process-label">INVOICE PREPARATION</span>
                <h3>Create the invoice</h3>
                <p>Add items, quantities, and service charges. The guest sees the full breakdown before paying.</p>
              </div>
            </article>

            <article className="process-item">
              <div className="process-visual qr-visual">
                <div className="qr-frame"><QrCode size={104} strokeWidth={1.1} /></div>
              </div>
              <div className="process-content">
                <span className="process-label">GUEST CHECKOUT</span>
                <h3>Share the QR code</h3>
                <p>The guest scans the invoice, selects an available stablecoin network, and approves from their wallet.</p>
              </div>
            </article>

            <article className="process-item">
              <div className="process-visual verify-visual">
                <div className="verify-mark"><Check size={58} strokeWidth={4.5} /></div>
                <span>SETTLEMENT VERIFIED</span>
              </div>
              <div className="process-content">
                <span className="process-label">PAYMENT STATUS</span>
                <h3>Verify the payment</h3>
                <p>Once connected to a live payment integration, verified settlement can update the invoice and receipt.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="business-section section-pad" id="business">
        <div className="shell business-layout">
          <div className="business-copy">
            <p className="eyebrow">MADE FOR THE COUNTER</p>
            <h2>Give guests a bill<br />they can check.<br /><span>Before they pay.</span></h2>
            <p className="section-description">
              Give your team one place to prepare the bill and give guests a
              direct way to pay. Keep the invoice, payment status, and receipt together.
            </p>
            <Link href="/register?mode=signup" className="button button-light">Create business account <ArrowUpRight size={15} strokeWidth={1.7} aria-hidden="true" /></Link>
          </div>
          <div className="business-details">
            <div className="detail-row">
              <span><Clock3 size={17} /> A faster handoff</span>
              <p>Guests open the checkout by scanning the invoice QR code.</p>
            </div>
            <div className="detail-row">
              <span><ShieldCheck size={17} /> A clear payment status</span>
              <p>Settlement status, not a screenshot, determines when a bill is paid.</p>
            </div>
            <div className="detail-row">
              <span><Wallet size={17} /> Supported stablecoins</span>
              <p>Let guests choose from the assets and networks your business supports.</p>
            </div>
            <div className="detail-row">
              <span><CircleHelp size={17} /> A receipt that stays connected</span>
              <p>Keep the itemized bill and its payment record together.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="closing-section">
        <div className="shell closing-inner">
          <p className="eyebrow">NODUS CHECKOUT</p>
          <h2>Ready to send<br /><span>your first invoice?</span></h2>
          <div className="closing-bottom">
            <p>Create your business workspace to prepare itemized invoices, share a QR checkout, and track payment status.</p>
            <Link href="/register?mode=signup" className="button button-light">Create business account <ArrowUpRight size={15} strokeWidth={1.7} aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="shell footer-main">
          <div className="footer-brand-block">
            <Link href="#top" className="brand footer-brand">
              <Image src="/logo.svg" alt="Nodus logo" width={331} height={213} style={{ height: "20px", width: "auto", display: "inline-block" }} aria-hidden="true" />
              <span>nodus<span className="brand-period">.</span></span>
            </Link>
            <p>Prepare itemized invoices, share a QR checkout, and keep payment status tied to verified settlement.</p>
          </div>
          <div className="footer-nav-group">
            <span className="footer-label">EXPLORE</span>
            <Link href="#checkout">Checkout demo</Link>
            <Link href="#how-it-works">How it works</Link>
            <Link href="#business">For business</Link>
          </div>
          <div className="footer-nav-group">
            <span className="footer-label">THE PRODUCT</span>
            <span>Itemized invoices</span>
            <span>QR checkout</span>
            <span>Payment verification</span>
          </div>
          <div className="footer-contact">
            <span className="footer-label">GET STARTED</span>
            <Link href="/register?mode=signup" prefetch={true} className="footer-cta">Create a business account <ArrowUpRight size={15} strokeWidth={1.7} aria-hidden="true" /></Link>
            <Link href="/login?next=%2Fdashboard" prefetch={true} className="footer-cta">Log in to dashboard <ArrowUpRight size={15} strokeWidth={1.7} aria-hidden="true" /></Link>
          </div>
        </div>
        <div className="shell footer-bottom">
          <span>© {new Date().getFullYear()} Nodus</span>
          <span>Built around a clearer way to pay.</span>
          <Link href="#top">Back to top ↑</Link>
        </div>
        <div className="hands-feature" aria-label="Nodus dot matrix hand animation">
          <div className="hands-feature-inner">
            <DotMatrixHands />
          </div>
        </div>
      </footer>
    </main>
  );
}
