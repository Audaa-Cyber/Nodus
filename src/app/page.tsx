import Link from "next/link";
import { ArrowDownRight, ArrowRight, ChevronRight, CircleDot, ReceiptText, ScanLine, ShieldCheck, WalletCards } from "lucide-react";
import SatinRidges from "@/components/satin-ridges";

const steps = [
  { number: "01", icon: ReceiptText, title: "Build the bill", body: "Add the items, quantities, tax and service details. Your team can reuse saved business information every time." },
  { number: "02", icon: ScanLine, title: "Show one QR code", body: "The guest scans, checks every line of the bill, and chooses a supported asset and network to pay with." },
  { number: "03", icon: WalletCards, title: "Confirm and receipt", body: "The payment is verified before the bill is marked paid. A digital receipt is ready to download." },
];

const features = [
  { icon: ReceiptText, title: "Bills that make sense", body: "Itemized invoices customers can review before they pay. No mystery totals, no awkward back-and-forth." },
  { icon: ScanLine, title: "One QR at the table", body: "Create a checkout QR for each bill. Guests scan it with their own wallet and approve the payment themselves." },
  { icon: ShieldCheck, title: "Payment status you can trust", body: "A bill is only complete after settlement is checked by the system, not just because someone tapped a button." },
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <SatinRidges
          className="hero-satin"
          colors={["#2A2A30", "#A1A1B5"]}
          backgroundColor="#050505"
          angle={-20}
          scale={1}
          depth={1}
          warp={1}
          detail={1}
          gloss={0.4}
          highlight={1}
          sheen={0.5}
          lightAngle={10}
          flow={1}
          speed={1}
          interactive
          swell={1}
          swellRadius={0.22}
          clickRipples
          seed={0}
          paused={false}
          dpr={1.5}
        />
        <div className="hero-vignette" />
        <nav className="nav shell">
          <Link href="/" className="brand"><span className="brand-mark"><span /></span> nodus<span className="brand-period">.</span></Link>
          <div className="nav-links">
            <Link href="#how-it-works">How it works</Link>
            <Link href="#businesses">For businesses</Link>
            <Link href="#why-nodus">Why Nodus</Link>
          </div>
          <Link className="nav-cta" href="#how-it-works">Explore Nodus <ArrowUpRightIcon /></Link>
        </nav>
        <div className="hero-content shell">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> BUSINESS PAYMENTS, MADE CLEAR</div>
            <h1>Every bill.<br /><span>Clear to pay.</span></h1>
            <p className="hero-description">Create an itemized bill. Let guests scan a QR code and pay with supported stablecoins. Verify the payment and deliver a digital receipt, all in one flow.</p>
            <div className="hero-actions">
              <Link href="#how-it-works" className="button button-primary">See how it works <ArrowRight size={16} /></Link>
              <Link href="#businesses" className="button button-quiet">For businesses <ArrowDownRight size={16} /></Link>
            </div>
            <div className="hero-footnote"><span className="footnote-line" /> Built for the moment the bill arrives.</div>
          </div>
          <div className="hero-aside">
            <div className="hero-aside-top">A simpler checkout, from first line to final receipt.</div>
            <div className="hero-aside-bottom"><span>01 / 03</span><span>THE NODUS FLOW</span></div>
          </div>
        </div>
        <div className="hero-bottom shell"><span>SCROLL TO EXPLORE</span><span className="scroll-line" /><span>01 — 03</span></div>
      </section>

      <section className="intro section-pad" id="businesses">
        <div className="shell intro-grid">
          <div className="section-kicker">01 / THE IDEA</div>
          <div>
            <h2>The bill is the starting point.<br /><span>The rest should be simple.</span></h2>
            <p className="intro-copy">Nodus helps restaurants and other businesses prepare a clear bill, collect a customer-approved digital payment, and keep the receipt connected to the transaction.</p>
          </div>
        </div>
      </section>

      <section className="steps-section section-pad" id="how-it-works">
        <div className="shell">
          <div className="section-heading">
            <div><div className="section-kicker">02 / HOW IT WORKS</div><h2>Three steps.<br /><span>One clean checkout.</span></h2></div>
            <p>Designed around the way a real table gets paid, not the way crypto infrastructure is built.</p>
          </div>
          <div className="steps-grid">
            {steps.map((step) => {
              const Icon = step.icon;
              return <article className="step-card" key={step.number}><div className="step-top"><span>{step.number}</span><Icon size={20} strokeWidth={1.5} /></div><h3>{step.title}</h3><p>{step.body}</p><div className="step-rule" /></article>;
            })}
          </div>
        </div>
      </section>

      <section className="features-section section-pad" id="why-nodus">
        <div className="shell">
          <div className="section-heading feature-heading">
            <div><div className="section-kicker">03 / BUILT FOR REAL CHECKOUTS</div><h2>Less payment friction.<br /><span>More clarity for everyone.</span></h2></div>
            <p>Keep the customer in control of the payment, while Nodus handles the work of connecting the bill to its verified result.</p>
          </div>
          <div className="feature-grid">
            {features.map((feature) => {
              const Icon = feature.icon;
              return <article className="feature-card" key={feature.title}><div className="feature-icon"><Icon size={21} strokeWidth={1.5} /></div><h3>{feature.title}</h3><p>{feature.body}</p><ChevronRight className="feature-arrow" size={18} /></article>;
            })}
          </div>
        </div>
      </section>

      <section className="closing section-pad">
        <div className="shell closing-inner">
          <div className="section-kicker">A BETTER WAY TO CLOSE THE BILL</div>
          <h2>Make the last step<br /><span>the easiest one.</span></h2>
          <p>From an itemized bill to a verified payment and a ready-to-keep receipt.</p>
          <Link href="#how-it-works" className="button button-primary">Explore the Nodus flow <ArrowRight size={16} /></Link>
        </div>
      </section>

      <footer className="footer shell"><Link href="/" className="brand"><span className="brand-mark"><span /></span> nodus<span className="brand-period">.</span></Link><span>Clear bills. Confirmed payments.</span><span>© {new Date().getFullYear()} Nodus</span></footer>
    </main>
  );
}

function ArrowUpRightIcon() {
  return <ArrowRight size={15} className="arrow-up-right" />;
}
