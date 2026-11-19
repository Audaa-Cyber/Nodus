import Link from "next/link";
import { getPublishedCmsDocument } from "@/lib/cms/public";
import { CmsPublicPage } from "@/components/cms-public-page";

const sections = [
  {
    title: "1. Using Nodus",
    body: [
      "Nodus provides tools for businesses to prepare itemized invoices, share invoice links or QR checkout experiences, receive supported digital-asset payments, and review payment and settlement status. By accessing Nodus, you agree to these terms.",
      "Some pages or demonstrations may be illustrative or use simulated transactions. A simulated payment does not transfer funds, create a blockchain transaction, or prove that a real payment has settled."
    ]
  },
  {
    title: "2. Business accounts",
    body: [
      "You must provide accurate account and business information and keep it up to date. You are responsible for activity carried out through your account and for protecting your sign-in credentials.",
      "Businesses are responsible for the invoices they create, including customer details, line items, prices, taxes, discounts, payment terms, and the accuracy of receiving network and wallet information. You must have the right to use the information and branding you upload."
    ]
  },
  {
    title: "3. Invoices and customer information",
    body: [
      "Nodus helps businesses create and share invoices. A business that issues an invoice is responsible for its commercial relationship with the customer, the accuracy of the invoice, and any notices or disclosures required by law.",
      "Anyone with access to a valid invoice-sharing link may be able to view the invoice information made available through that link until the link expires or is disabled. Businesses should share invoice links only with their intended recipients."
    ]
  },
  {
    title: "4. Wallets, networks, and payments",
    body: [
      "Payments depend on compatible third-party wallets, assets, networks, payment infrastructure, and network availability. Supported networks and assets may change. You are responsible for checking the selected asset, network, amount, recipient, and transaction details before approving a payment.",
      "A wallet approval, payment attempt, or pending transaction is not necessarily a completed payment. Nodus uses payment and settlement information to determine whether a payment can be treated as verified. Businesses should not mark an invoice paid based solely on a screenshot, customer statement, or unconfirmed transaction.",
      "Blockchain transactions may be irreversible, delayed, publicly visible, or affected by network congestion and fees. Nodus cannot reverse a transaction on a public blockchain or guarantee network availability, confirmation time, exchange value, or third-party wallet behavior.",
      "Nodus does not ask you to disclose your wallet recovery phrase or private key. Never provide those credentials to another person or website."
    ]
  },
  {
    title: "5. Third-party services",
    body: [
      "Nodus integrates with third-party infrastructure, including authentication/database services, wallet and payment technology, and blockchain networks. Those services are governed by their own terms, policies, availability, and technical requirements.",
      "Nodus is not responsible for a third party's wallet software, network outage, transaction processing, fees, exchange rates, or independent actions. You should review the applicable third-party terms before using those services."
    ]
  },
  {
    title: "6. Acceptable use",
    body: [
      "You may not use Nodus to break the law, infringe another person's rights, submit false or misleading invoices, facilitate fraud, interfere with the service, probe or bypass access controls, or misuse another person's account, wallet, or personal information.",
      "You must comply with applicable tax, consumer-protection, sanctions, anti-money-laundering, and other legal requirements that apply to your business and transactions."
    ]
  },
  {
    title: "7. Availability and changes",
    body: [
      "Nodus may change, suspend, or discontinue features to maintain or improve the service, respond to security issues, or comply with legal requirements. We do not promise uninterrupted or error-free availability.",
      "We may update these terms as the product evolves. Continued use after updated terms are published means you accept the revised terms to the extent permitted by applicable law."
    ]
  },
  {
    title: "8. Disclaimers and liability",
    body: [
      "Nodus is a software tool and does not provide legal, tax, accounting, investment, or financial advice. You are responsible for deciding whether a transaction, asset, network, or invoice is appropriate for your circumstances.",
      "To the extent permitted by applicable law, Nodus is provided on an as-available basis and we disclaim warranties that cannot lawfully be excluded. Nothing in these terms excludes liability that cannot be excluded under applicable law."
    ]
  },
  {
    title: "9. Contact and governing terms",
    body: [
      "Questions about these terms should be directed through Nodus's official support channel. Before public launch, Nodus should add its legal entity name, an official contact address, and the governing law and dispute-resolution terms applicable to the service."
    ]
  }
];

export default async function TermsPage() {
  const cmsDocument = await getPublishedCmsDocument("terms");
  if (cmsDocument?.kind === "legal") return <CmsPublicPage document={cmsDocument} eyebrow="NODUS / LEGAL" />;
  return (
    <main className="min-h-screen bg-white text-[#171816]">
      <div className="mx-auto w-full max-w-[820px] px-6 py-12 sm:px-10 sm:py-20">
        <Link href="/" className="inline-flex text-sm text-neutral-500 transition-colors hover:text-black">← Back to Nodus</Link>
        <header className="mt-14 border-b border-neutral-200 pb-10">
          <p className="text-[10px] font-medium uppercase tracking-[.2em] text-neutral-500">NODUS / LEGAL</p>
          <h1 className="mt-4 text-4xl font-medium tracking-[-.055em] sm:text-5xl">Terms of service</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-neutral-600">The rules for using Nodus invoices, checkout, wallets, and payment features.</p>
          <p className="mt-5 text-xs text-neutral-500">Last updated: November 19, 2026</p>
        </header>
        <div className="divide-y divide-neutral-100">
          {sections.map((section) => (
            <section key={section.title} className="py-8">
              <h2 className="text-lg font-medium tracking-tight">{section.title}</h2>
              <div className="mt-4 space-y-4">
                {section.body.map((paragraph) => <p key={paragraph} className="text-sm leading-7 text-neutral-600">{paragraph}</p>)}
              </div>
            </section>
          ))}
        </div>
        <p className="border-t border-neutral-200 pt-6 text-xs leading-6 text-neutral-500">These terms are a product draft, not legal advice. They must be reviewed and completed with Nodus's legal entity, contact details, governing law, and production service arrangements before public launch.</p>
        <div className="mt-8 flex gap-6 text-xs text-neutral-500"><Link href="/privacy" className="hover:text-black">Privacy policy</Link><Link href="/" className="hover:text-black">Home</Link></div>
      </div>
    </main>
  );
}
