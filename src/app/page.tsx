"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
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

const methods = ["USDC · Arc Testnet", "USDC · Ethereum Sepolia", "USDC · Base Sepolia", "USDC · Arbitrum Sepolia", "USDC · Optimism Sepolia"];

export default function Home() {
  const [method, setMethod] = useState(methods[0]);
  const [paymentState, setPaymentState] = useState<"idle" | "processing" | "paid">("idle");
  const [items, setItems] = useState([
    { id: 1, name: "House espresso", price: 4.5, quantity: 1 },
    { id: 2, name: "Almond croissant", price: 6, quantity: 1 },
    { id: 3, name: "Still water", price: 2.5, quantity: 1 },
  ]);
  const paymentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.15;
  const total = subtotal + tax;
  const formatUsd = (amount: number) => "$" + amount.toFixed(2);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
    if (paymentTimer.current) clearTimeout(paymentTimer.current);
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
    const height = 470 + items.length * 34;
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = height * 2;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(2, 2);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 360, height);
    context.fillStyle = "#171816";
    context.textAlign = "left";
    context.font = "700 20px Arial";
    context.fillText("PAYMENT RECEIPT", 24, 42);
    context.font = "600 16px Arial";
    context.fillText("Maison Café", 24, 78);
    context.font = "12px Arial";
    context.fillStyle = "#777777";
    context.fillText("Addis Ababa · Table 08", 24, 98);
    context.save();
    context.translate(300, 78);
    context.rotate(0.22);
    context.strokeStyle = "#27804a";
    context.lineWidth = 3;
    context.globalAlpha = 0.8;
    context.beginPath();
    context.ellipse(0, 0, 39, 20, 0, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = "#27804a";
    context.font = "800 16px Arial";
    context.textAlign = "center";
    context.fillText("PAID", 0, 5);
    context.restore();
    let y = 132;
    context.strokeStyle = "#d8d8d8";
    context.beginPath(); context.moveTo(24, y); context.lineTo(336, y); context.stroke();
    y += 24;
    context.fillStyle = "#555555";
    context.font = "12px Arial";
    context.textAlign = "left";
    context.fillText("Receipt no.  NODUS-0248", 24, y);
    y += 20;
    context.fillText("Date  " + new Date().toLocaleString(), 24, y);
    y += 20;
    context.fillText("Payment method  " + method, 24, y);
    y += 20;
    context.fillText("Payment status  PAID", 24, y);
    y += 22;
    context.strokeStyle = "#d8d8d8";
    context.beginPath(); context.moveTo(24, y); context.lineTo(336, y); context.stroke();
    y += 24;
    context.fillStyle = "#171816";
    context.font = "12px Arial";
    items.forEach((item) => {
      context.textAlign = "left";
      context.fillText(item.name + " × " + item.quantity, 24, y);
      context.textAlign = "right";
      context.fillText(formatUsd(item.price * item.quantity), 336, y);
      y += 30;
    });
    context.textAlign = "left";
    context.fillText("Subtotal", 24, y);
    context.textAlign = "right";
    context.fillText(formatUsd(subtotal), 336, y);
    y += 30;
    context.textAlign = "left";
    context.fillText("Tax · 15%", 24, y);
    context.textAlign = "right";
    context.fillText(formatUsd(tax), 336, y);
    y += 22;
    context.strokeStyle = "#171816";
    context.beginPath(); context.moveTo(24, y); context.lineTo(336, y); context.stroke();
    y += 32;
    context.font = "700 15px Arial";
    context.textAlign = "left";
    context.fillText("TOTAL PAID", 24, y);
    context.textAlign = "right";
    context.fillText(formatUsd(total) + " USD", 336, y);
    y += 34;
    context.strokeStyle = "#d8d8d8";
    context.beginPath(); context.moveTo(24, y); context.lineTo(336, y); context.stroke();
    y += 24;
    context.fillStyle = "#666666";
    context.font = "11px Arial";
    context.textAlign = "left";
    context.fillText("Transaction reference", 24, y);
    y += 18;
    context.fillStyle = "#171816";
    context.font = "600 12px Arial";
    context.fillText("NODUS-DEMO-0248-7F3A", 24, y);
    y += 36;
    context.fillStyle = "#777777";
    context.font = "12px Arial";
    context.textAlign = "center";
    context.fillText("Thank you for visiting Maison Café.", 180, y);
    y += 18;
    context.font = "10px Arial";
    context.fillText("Simulated payment · No funds were transferred", 180, y);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "nodus-payment-receipt.png";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
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
            <Link href="/register?mode=signup" prefetch={true} className="mobile-business-link" onClick={closeMenu}>Sign up</Link>
          </div>

          <div className="nav-right">
            <Link href="/login?next=%2Fdashboard" prefetch={true} className="nav-login">Log in</Link>
            <Link href="/register?mode=signup" prefetch={true} className="nav-cta nav-register">Sign up <ArrowUpRight size={14} strokeWidth={1.7} aria-hidden="true" /></Link>
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
              <Link href="#checkout" className="button button-dark">View demo <ArrowUpRight size={15} strokeWidth={1.7} aria-hidden="true" /></Link>
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
          </div>

          <div className="invoice-stage">
            <div className="invoice-card demo-invoice-card">
              <div className="demo-invoice-document">
                <header className="demo-invoice-header">
                  <div className="demo-merchant">
                    <span className="demo-merchant-mark">m.</span>
                    <div><strong>Maison Café</strong><small>ADDIS ABABA · ETHIOPIA</small></div>
                  </div>
                  <div className="demo-invoice-number"><span>INVOICE</span><strong>N° 0248</strong><small>ISSUED {new Date().toLocaleDateString()}</small></div>
                </header>
                <div className="demo-invoice-parties">
                  <div><span className="demo-field-label">BILLED BY</span><strong>Maison Café</strong><small>Bole Road, Addis Ababa</small><small>billing@maisoncafe.example</small></div>
                  <div><span className="demo-field-label">BILLED TO</span><strong>Walk-in customer</strong><small>Customer checkout</small></div>
                </div>
                <div className="demo-invoice-table-wrap">
                  <table className="demo-invoice-table">
                    <thead><tr><th>DESCRIPTION</th><th>QTY</th><th>UNIT PRICE</th><th>AMOUNT</th></tr></thead>
                    <tbody>{items.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.name}</strong></td>
                        <td><div className="demo-quantity-control"><button type="button" onClick={() => updateQuantity(item.id, -1)} disabled={item.quantity <= 1} aria-label={"Decrease " + item.name + " quantity"}>−</button><span>{item.quantity}</span><button type="button" onClick={() => updateQuantity(item.id, 1)} disabled={item.quantity >= 9} aria-label={"Increase " + item.name + " quantity"}>+</button></div></td>
                        <td>{formatUsd(item.price)}</td>
                        <td><strong>{formatUsd(item.price * item.quantity)}</strong></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div className="demo-invoice-totals">
                  <div><span>Subtotal</span><strong>{formatUsd(subtotal)}</strong></div>
                  <div><span>Tax (15%)</span><strong>{formatUsd(tax)}</strong></div>
                  <div className="demo-invoice-total"><span>Total due</span><strong>{formatUsd(total)} USD</strong></div>
                </div>
                <footer className="demo-invoice-footer"><span>Thank you for your business.</span><span>nodus.</span></footer>
              </div>

              <div className="demo-payment-panel">
                <div className="pay-label">
                  <span>PAYMENT</span>
                  <span className="secure-label"><LockKeyhole size={11} /> DEMO</span>
                </div>
                <div className="method-select">
                  <select aria-label="Choose payment network" value={method} onChange={(event) => {
                    if (paymentTimer.current) clearTimeout(paymentTimer.current);
                    setMethod(event.target.value);
                    setPaymentState("idle");
                  }}>
                    {methods.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <ChevronDown size={14} aria-hidden="true" />
                </div>
                <button className={paymentState === "paid" ? "pay-button is-paid" : "pay-button"} type="button" onClick={runDemoPayment} disabled={paymentState !== "idle"}>
                  {paymentState === "processing" ? <><span className="demo-spinner" /> Processing payment…</> : paymentState === "paid" ? <><Check size={16} /> Payment successful</> : "Pay " + formatUsd(total)}
                </button>
                <div className={"payment-feedback " + (paymentState !== "idle" ? "is-visible" : "")} aria-live="polite">
                  <span className="success-pulse" />
                  {paymentState === "processing" ? "Checking the simulated transaction…" : paymentState === "paid" ? "Payment confirmed. The invoice is marked paid." : "Demo transaction. No wallet is connected and no funds move."}
                </div>
                {paymentState === "paid" && (
                  <div className="demo-printer-overlay" aria-live="polite">
                    <div className="demo-printer-shell">
                      <div className="demo-printer-slot"><span /></div>
                      <div className="demo-printer-paper">
                        <div className="demo-paid-stamp">PAID</div>
                        <div className="demo-paper-brand"><strong>Maison Café</strong><span>PAYMENT RECEIPT</span></div>
                        <div className="demo-paper-meta"><span>Invoice N° 0248</span><span>{new Date().toLocaleString()}</span></div>
                        <div className="demo-paper-rule" />
                        {items.map((item) => <div className="demo-paper-line" key={item.id}><span>{item.name} × {item.quantity}</span><strong>{formatUsd(item.price * item.quantity)}</strong></div>)}
                        <div className="demo-paper-line"><span>Subtotal</span><strong>{formatUsd(subtotal)}</strong></div>
                        <div className="demo-paper-line"><span>Tax · 15%</span><strong>{formatUsd(tax)}</strong></div>
                        <div className="demo-paper-rule" />
                        <div className="demo-paper-line demo-paper-total"><strong>TOTAL PAID</strong><strong>{formatUsd(total)} USD</strong></div>
                        <div className="demo-paper-meta demo-paper-settlement"><span>{method}</span><span>Demo reference · NODUS-0248</span><span>Payment simulated for preview</span></div>
                        <p>Thank you for your business.</p>
                      </div>
                      <div className="demo-printer-base"><span /></div>
                    </div>
                    <button className="demo-download-receipt" type="button" onClick={downloadReceipt}>Download receipt</button>
                  </div>
                )}
                <div className="invoice-foot"><ShieldCheck size={13} /> A real invoice is marked paid only after settlement is verified.</div>
              </div>
            </div>
            <p className="invoice-note">Customer-facing invoice layout. Payment in this demo is simulated.</p>
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
            <Link href="/register?mode=signup" className="button button-light">Create account <ArrowUpRight size={15} strokeWidth={1.7} aria-hidden="true" /></Link>
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
          <div className="footer-nav-group footer-legal-group">
            <span className="footer-label">LEGAL</span>
            <Link href="/privacy" className="footer-legal-link">Privacy</Link>
            <Link href="/terms" className="footer-legal-link">Terms</Link>
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
