"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  FileText,
  LockKeyhole,
  Menu,
  QrCode,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import BinaryField from "@/components/binary-field";

const methods = ["USDC · Ethereum", "USDC · Solana", "USDT · Ethereum"];

export default function Home() {
  const [method, setMethod] = useState(methods[0]);
  const [demoPaid, setDemoPaid] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
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

  return (
    <main>
      <section className="hero" id="top">
        <nav className="nav shell" aria-label="Main navigation">
          <Link href="#top" className="brand" onClick={closeMenu} aria-label="Nodus home">
            <span className="brand-mark">n</span>
            <span>nodus<span className="brand-period">.</span></span>
          </Link>

          <div id="primary-navigation" className={menuOpen ? "nav-links is-open" : "nav-links"}>
            <Link href="#checkout" onClick={closeMenu}>Checkout</Link>
            <Link href="#how-it-works" onClick={closeMenu}>How it works</Link>
            <Link href="#business" onClick={closeMenu}>For business</Link>
          </div>

          <div className="nav-right">
            <Link href="#checkout" className="nav-cta">View the demo <ArrowUpRight size={14} strokeWidth={1.7} aria-hidden="true" /></Link>
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
          <p className="hero-kicker">A BETTER WAY TO GET PAID</p>
          <h1>Close the bill.<br /><span>Keep things moving.</span></h1>
          <div className="hero-bottom">
            <p className="hero-lede">
              Nodus turns an itemized invoice into a QR checkout. Guests scan,
              choose a supported stablecoin, and approve payment from their wallet.
            </p>
            <div className="hero-actions">
              <Link href="#checkout" className="button button-dark">Explore the checkout <ArrowUpRight size={15} strokeWidth={1.7} aria-hidden="true" /></Link>
              <Link href="#how-it-works" className="button-link">How it works <ArrowRight size={15} strokeWidth={1.6} aria-hidden="true" /></Link>
            </div>
          </div>
        </div>

        <div className="binary-stage" aria-hidden="true">
          <BinaryField />
          <div className="binary-caption"><span>INVOICE</span><span>PAYMENT</span><span>CONFIRMATION</span></div>
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
              <div className="invoice-lines">
                <div><span>House espresso</span><b>$4.50</b></div>
                <div><span>Almond croissant</span><b>$6.00</b></div>
                <div><span>Still water</span><b>$2.50</b></div>
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
                  <span>Subtotal <b>$13.00</b></span>
                  <span>Service · 10% <b>$1.30</b></span>
                </div>
              </div>
              <div className="invoice-total">
                <span>Total due</span>
                <strong>$14.30 <small>USD</small></strong>
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
                    setMethod(event.target.value);
                    setDemoPaid(false);
                  }}
                >
                  {methods.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </div>
              <button
                className={demoPaid ? "pay-button is-paid" : "pay-button"}
                type="button"
                onClick={() => setDemoPaid((paid) => !paid)}
              >
                {demoPaid ? <><Check size={16} /> Demo state complete</> : "Simulate payment"}
              </button>
              <div className={demoPaid ? "payment-feedback is-visible" : "payment-feedback"} aria-live="polite">
                <span className="success-pulse" />
                Demo only. No wallet was connected and no funds moved.
              </div>
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
            <h2>The bill is part<br />of the <span>service.</span></h2>
            <p>
              A guest remembers how a meal ends. Make the final step as clear as
              the menu: every item accounted for, every payment choice visible,
              and the status easy to understand.
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
              <h2>Three steps.<br /><span>One smoother checkout.</span></h2>
            </div>
            <p className="section-description">
              The invoice carries the details. The QR code gets the guest to
              checkout. Verified settlement closes the loop.
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
                <div className="verify-mark"><Check size={38} strokeWidth={1.3} /></div>
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
            <h2>Less time<br />chasing payments.<br /><span>More time serving.</span></h2>
            <p className="section-description">
              Give your team one place to prepare the bill and give guests a
              direct way to pay. Keep the invoice, payment status, and receipt together.
            </p>
            <Link href="#checkout" className="button button-light">See the guest checkout <ArrowUpRight size={15} strokeWidth={1.7} aria-hidden="true" /></Link>
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
          <h2>Make paying<br /><span>the easy part.</span></h2>
          <div className="closing-bottom">
            <p>Itemized invoices. Wallet-approved payments. Verified payment status.</p>
            <Link href="#checkout" className="button button-light">Explore the checkout <ArrowUpRight size={15} strokeWidth={1.7} aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="shell footer-main">
          <div className="footer-brand-block">
            <Link href="#top" className="brand footer-brand">
              <span className="brand-mark">n</span>
              <span>nodus<span className="brand-period">.</span></span>
            </Link>
            <p>Clear invoices. Simple QR checkout. Stablecoin payments for everyday business.</p>
          </div>
          <div className="footer-nav-group">
            <span className="footer-label">EXPLORE</span>
            <Link href="#checkout">Checkout</Link>
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
            <Link href="#checkout" className="footer-cta">View the checkout <ArrowUpRight size={15} strokeWidth={1.7} aria-hidden="true" /></Link>
          </div>
        </div>
        <div className="shell footer-bottom">
          <span>© {new Date().getFullYear()} Nodus</span>
          <span>Built around a clearer way to pay.</span>
          <Link href="#top">Back to top ↑</Link>
        </div>
      </footer>
    </main>
  );
}
