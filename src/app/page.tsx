"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Check, ChevronDown, CircleHelp, Clock3, Copy, FileText, LockKeyhole, Menu, QrCode, ShieldCheck, Wallet, X } from "lucide-react";
import DotMatrixHands from "@/components/dot-matrix-hands";

const methods = ["USDC · Ethereum", "USDC · Solana", "USDT · Ethereum"];

export default function Home() {
  const [method, setMethod] = useState(methods[0]);
  const [demoPaid, setDemoPaid] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText("NODUS-INV-0248");
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch { setCopied(false); }
  };
  const closeMenu = () => setMenuOpen(false);

  return (
    <main>
      <section className="hero kindred-hero" id="top">
        <DotMatrixHands />
        <nav className="nav shell" aria-label="Main navigation">
          <Link href="#top" className="brand" onClick={closeMenu}><span className="brand-symbol">n</span><span>nodus<span className="brand-dot">.</span></span></Link>
          <div id="primary-navigation" className={menuOpen ? "nav-links is-open" : "nav-links"}>
            <Link href="#product" onClick={closeMenu}>Product</Link>
            <Link href="#flow" onClick={closeMenu}>How it works</Link>
            <Link href="#business" onClick={closeMenu}>For business</Link>
          </div>
          <div className="nav-right">
            <Link href="#demo" className="nav-cta">Explore checkout <ArrowUpRight size={15} /></Link>
            <button className="menu-toggle" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
          </div>
        </nav>
        <div className="hero-copy">
          <div className="eyebrow"><span /> BILLING, WITHOUT THE FRICTION</div>
          <h1><span>Every bill,</span><br /><strong>beautifully settled.</strong></h1>
          <p className="hero-lede">Turn an itemized bill into a simple QR checkout. Customers scan, choose a supported stablecoin, and approve payment from their wallet.</p>
          <div className="hero-actions">
            <Link href="#demo" className="button button-dark hero-pill">Explore Nodus <ArrowUpRight size={16} /></Link>
            <Link href="#flow" className="text-link">See how it works <ArrowDown size={15} /></Link>
          </div>
          <div className="hero-note">A better last step for everyday commerce.</div>
        </div>
        <div className="hero-features" aria-label="Nodus workflow">
          <span><i>01</i> ITEMIZED BILL</span><span><i>02</i> QR CHECKOUT</span><span><i>03</i> STABLECOIN CHOICE</span><span><i>04</i> PAYMENT STATUS</span>
        </div>
      </section>

      <section className="demo-section section-pad" id="demo">
        <div className="shell demo-layout">
          <div className="demo-intro">
            <div className="section-index">01 <i>/</i> TRY THE CHECKOUT</div>
            <h2>A bill your<br /><em>customers understand.</em></h2>
            <p>Explore the guest experience, from a clear itemized bill to a customer-approved payment choice.</p>
            <span className="demo-disclaimer">INTERACTIVE PREVIEW · SIMULATED PAYMENT · NO REAL FUNDS MOVE</span>
          </div>
          <div className="hero-demo-wrap">
            <div className="demo-caption"><span>INVOICE PREVIEW</span><span>01 / 01</span></div>
            <div className="invoice-card">
              <div className="invoice-top"><div><span className="micro-label">YOUR BILL FROM</span><h3>Maison Café</h3><p>Table 08 · Addis Ababa</p></div><div className="invoice-logo" aria-hidden="true">m.</div></div>
              <div className="invoice-meta"><span>INVOICE <b>N° 0248</b></span><button onClick={handleCopy} className="copy-id" type="button" aria-label="Copy invoice ID">{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? "Copied" : "Copy ID"}</button></div>
              <div className="invoice-lines"><div><span>House espresso</span><b>$4.50</b></div><div><span>Almond croissant</span><b>$6.00</b></div><div><span>Still water</span><b>$2.50</b></div></div>
              <button className="breakdown-toggle" type="button" onClick={() => setShowBreakdown((open) => !open)} aria-expanded={showBreakdown} aria-controls="invoice-breakdown"><span>Subtotal &amp; service</span><ChevronDown size={14} className={showBreakdown ? "rotate" : ""} /></button>
              <div id="invoice-breakdown" className={showBreakdown ? "breakdown-clip is-open" : "breakdown-clip"} aria-hidden={!showBreakdown}><div className="breakdown-detail"><span>Subtotal <b>$13.00</b></span><span>Service · 10% <b>$1.30</b></span></div></div>
              <div className="invoice-total"><span>Total due</span><strong>$14.30 <small>USD</small></strong></div>
              <div className="pay-label"><span>PAY WITH</span><span className="secure-label"><LockKeyhole size={11} /> PREVIEW ONLY</span></div>
              <div className="method-select"><select aria-label="Choose payment network" value={method} onChange={(event) => { setMethod(event.target.value); setDemoPaid(false); }}>{methods.map((item) => <option key={item} value={item}>{item}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></div>
              <button className={demoPaid ? "pay-button is-paid" : "pay-button"} type="button" onClick={() => setDemoPaid((paid) => !paid)}>{demoPaid ? <><Check size={16} /> Demo state complete</> : <>Simulate a payment <ArrowUpRight size={16} /></>}</button>
              <div className={demoPaid ? "payment-feedback is-visible" : "payment-feedback"} aria-live="polite"><span className="success-pulse" /> Demo only. No wallet was connected and no funds moved.</div>
              <div className="invoice-foot"><ShieldCheck size={13} /> A real invoice should close only after settlement is verified.</div>
            </div>
            <div className="demo-footnote"><span>INTERACTIVE DEMO</span><span>Change the network or expand the total</span></div>
          </div>
        </div>
      </section>

      <section className="manifesto section-pad" id="product">
        <div className="shell manifesto-grid">
          <div className="section-index">02 <i>/</i> THE THINKING</div>
          <div className="manifesto-content">
            <p className="manifesto-overline">A SMALL MOMENT. A BETTER EXPERIENCE.</p>
            <h2>The payment should feel<br />as considered as <em>the service.</em></h2>
            <div className="manifesto-bottom"><p className="manifesto-copy">A bill is more than a number at the bottom of a meal. It is the last touchpoint between a business and its guest. Nodus makes that moment clear, calm, and easy to trust.</p><span className="manifesto-mark" aria-hidden="true">N° 0248</span></div>
          </div>
        </div>
      </section>

      <section className="flow-section section-pad" id="flow">
        <div className="shell">
          <div className="section-head"><div><div className="section-index">03 <i>/</i> THE FLOW</div><h2>From table to<br /><em>settled.</em></h2></div><p>Three deliberate steps. A clear bill, a familiar scan, and a payment status the business can trust.</p></div>
          <div className="flow-grid">
            <article className="flow-card"><div className="flow-number"><span>01</span><FileText size={17} /></div><div className="flow-illustration bill-illustration"><div className="paper-sheet"><span /><span /><span /><i /></div></div><div className="flow-copy"><h3>Prepare the bill</h3><p>Build an itemized invoice with quantities, service, and a clear total. Every line is visible before payment.</p></div></article>
            <article className="flow-card"><div className="flow-number"><span>02</span><QrCode size={17} /></div><div className="flow-illustration qr-illustration"><div className="qr-frame"><QrCode size={68} strokeWidth={1.15} /></div></div><div className="flow-copy"><h3>Let them scan</h3><p>One QR code opens a guest-friendly checkout. Customers choose a supported asset and approve from their wallet.</p></div></article>
            <article className="flow-card"><div className="flow-number"><span>03</span><ShieldCheck size={17} /></div><div className="flow-illustration settle-illustration"><div className="settle-ring"><Check size={31} strokeWidth={1.4} /></div><span className="settle-caption">PAYMENT VERIFIED</span></div><div className="flow-copy"><h3>Verify and close</h3><p>In a live integration, settlement verification updates the invoice and keeps its digital receipt connected.</p></div></article>
          </div>
        </div>
      </section>

      <section className="business-section section-pad" id="business">
        <div className="shell business-panel">
          <div className="business-copy"><div className="section-index">04 <i>/</i> FOR THE BUSINESS</div><h2>Keep service<br />moving. <em>Stay in control.</em></h2><p>Give your team a straightforward way to create bills and give guests a checkout that respects their time. Keep the invoice, payment status, and receipt connected.</p><Link href="#demo" className="button button-dark">Try the checkout preview <ArrowUpRight size={16} /></Link></div>
          <div className="business-details">
            <div className="detail-row"><span><Clock3 size={16} /> Less waiting</span><p>A QR checkout guests can complete at their own pace.</p></div>
            <div className="detail-row"><span><ShieldCheck size={16} /> Clear confirmation</span><p>Settlement status, not a screenshot, determines when a bill is paid.</p></div>
            <div className="detail-row"><span><Wallet size={16} /> Customer choice</span><p>Support selected stablecoins and networks with customer approval.</p></div>
            <div className="detail-row"><span><CircleHelp size={16} /> No hidden magic</span><p>Transparent totals and a receipt the guest can keep.</p></div>
          </div>
        </div>
      </section>

      <section className="closing section-pad"><div className="shell closing-inner"><div className="section-index">THE LAST STEP, RECONSIDERED</div><h2>Make the final<br /><em>moment feel right.</em></h2><div className="closing-bottom"><p>Clear bills. Customer-approved payments. A status both sides can understand.</p><Link href="#demo" className="button button-light">Explore Nodus <ArrowUpRight size={16} /></Link></div></div></section>
      <footer className="footer shell"><Link href="#top" className="brand"><span className="brand-symbol">n</span><span>nodus<span className="brand-dot">.</span></span></Link><span>Clear bills. Clear payment status.</span><span>© {new Date().getFullYear()} Nodus</span></footer>
    </main>
  );
}
