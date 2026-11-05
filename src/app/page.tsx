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
          <div className="eyebrow"><span /> INVOICES AND QR CHECKOUT</div>
          <h1><span>A clearer bill,</span><br /><strong>ready to pay.</strong></h1>
          <p className="hero-lede">Create an itemized bill and share it as a QR code. Guests scan it, choose a supported stablecoin, and approve the payment in their wallet.</p>
          <div className="hero-actions">
            <Link href="#demo" className="button button-dark hero-pill">Explore Nodus <ArrowUpRight size={16} /></Link>
            <Link href="#flow" className="text-link">See how it works <ArrowDown size={15} /></Link>
          </div>
          <div className="hero-note">For businesses that accept stablecoin payments.</div>
        </div>
        <div className="hero-features" aria-label="Nodus workflow">
          <span><i>01</i> ITEMIZED BILL</span><span><i>02</i> QR CHECKOUT</span><span><i>03</i> STABLECOIN CHOICE</span><span><i>04</i> PAYMENT STATUS</span>
        </div>
      </section>

      <section className="demo-section section-pad" id="demo">
        <div className="shell demo-layout">
          <div className="demo-intro">
            <div className="section-index">01 <i>/</i> TRY THE CHECKOUT</div>
            <h2>The full bill.<br /><em>Before they pay.</em></h2>
            <p>Change the payment network, inspect the total, and try the checkout flow.</p>
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
            <p className="manifesto-overline">THE BILL IS PART OF THE SERVICE</p>
            <h2>Guests should know<br />exactly <em>what they owe.</em></h2>
            <div className="manifesto-bottom"><p className="manifesto-copy">Guests should be able to check every item, see the total, and choose how to pay. Nodus puts those details in one QR checkout.</p><span className="manifesto-mark" aria-hidden="true">N° 0248</span></div>
          </div>
        </div>
      </section>

      <section className="flow-section section-pad" id="flow">
        <div className="shell">
          <div className="section-head"><div><div className="section-index">03 <i>/</i> THE FLOW</div><h2>From table to<br /><em>settled.</em></h2></div><p>Create the invoice, let the guest scan it, then verify the payment before closing the bill.</p></div>
          <div className="flow-grid">
            <article className="flow-card"><div className="flow-number"><span>01</span><FileText size={17} /></div><div className="flow-illustration bill-illustration"><div className="paper-sheet"><span /><span /><span /><i /></div></div><div className="flow-copy"><h3>Create the invoice</h3><p>Add items, quantities, and service charges. The guest sees the breakdown and total before paying.</p></div></article>
            <article className="flow-card"><div className="flow-number"><span>02</span><QrCode size={17} /></div><div className="flow-illustration qr-illustration"><div className="qr-frame"><QrCode size={68} strokeWidth={1.15} /></div></div><div className="flow-copy"><h3>Let them scan</h3><p>The guest scans the invoice QR code, selects an available stablecoin network, and approves the transaction in their wallet.</p></div></article>
            <article className="flow-card"><div className="flow-number"><span>03</span><ShieldCheck size={17} /></div><div className="flow-illustration settle-illustration"><div className="settle-ring"><Check size={31} strokeWidth={1.4} /></div><span className="settle-caption">PAYMENT VERIFIED</span></div><div className="flow-copy"><h3>Verify and close</h3><p>After the transaction settles, the payment integration can verify it and update the invoice status.</p></div></article>
          </div>
        </div>
      </section>

      <section className="business-section section-pad" id="business">
        <div className="shell business-panel">
          <div className="business-copy"><div className="section-index">04 <i>/</i> FOR THE BUSINESS</div><h2>Create bills.<br /><em>Track payment.</em></h2><p>Your team creates the invoice. Guests scan and pay from their wallets. The invoice stays linked to its payment status and receipt.</p><Link href="#demo" className="button button-dark">Try the checkout preview <ArrowUpRight size={16} /></Link></div>
          <div className="business-details">
            <div className="detail-row"><span><Clock3 size={16} /> Less waiting</span><p>Guests open the checkout by scanning the invoice QR code.</p></div>
            <div className="detail-row"><span><ShieldCheck size={16} /> Clear confirmation</span><p>Settlement status, not a screenshot, determines when a bill is paid.</p></div>
            <div className="detail-row"><span><Wallet size={16} /> Customer choice</span><p>Let guests choose from the stablecoins and networks your business supports.</p></div>
            <div className="detail-row"><span><CircleHelp size={16} /> No hidden magic</span><p>Show the total before payment and keep the receipt with the invoice.</p></div>
          </div>
        </div>
      </section>

      <section className="closing section-pad"><div className="shell closing-inner"><div className="section-index">NODUS CHECKOUT</div><h2>Give every bill<br /><em>a clear way to pay.</em></h2><div className="closing-bottom"><p>Itemized invoices. Wallet-approved payments. Verified payment status.</p><Link href="#demo" className="button button-light">Explore Nodus <ArrowUpRight size={16} /></Link></div></div></section>
      <footer className="footer shell"><Link href="#top" className="brand"><span className="brand-symbol">n</span><span>nodus<span className="brand-dot">.</span></span></Link><span>Invoices and payment status, in one place.</span><span>© {new Date().getFullYear()} Nodus</span></footer>
    </main>
  );
}
