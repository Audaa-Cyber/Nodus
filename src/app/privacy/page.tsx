import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedCmsDocument, getPublicCmsSettings } from "@/lib/cms/public";
import { CmsPublicPage } from "@/components/cms-public-page";


export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const [document, settings] = await Promise.all([
    getPublishedCmsDocument("privacy"),
    getPublicCmsSettings(),
  ]);
  const seo = (document?.seo ?? {}) as Record<string, unknown>;
  const title = typeof seo.title === "string" && seo.title.trim() ? seo.title : document?.title || "Privacy policy | Nodus";
  const description = typeof seo.description === "string" && seo.description.trim() ? seo.description : settings.seoDefaultDescription;
  const image = typeof seo.socialImage === "string" && /^https:\/\//.test(seo.socialImage) ? seo.socialImage : settings.seoDefaultSocialImage;
  return { title, description, openGraph: { title, description, ...(image ? { images: [image] } : {}) }, twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image ? { images: [image] } : {}) } };
}

const sections = [
  {
    title: "1. Who this policy covers",
    body: [
      "This policy explains how Nodus handles information when a business creates invoices, manages its receiving details, or uses a Nodus checkout link, and when a customer views or pays an invoice.",
      "Nodus is an invoice and payment workflow product. It helps businesses prepare itemized invoices, share them with customers, receive supported digital-asset payments, and track payment status against settlement information."
    ]
  },
  {
    title: "2. Information we handle",
    body: [
      "Account and business information. This can include your account identifier and email address, business name, business email, phone number, address, website, logo, tax registration details, invoice preferences, and receiving network and wallet address.",
      "Invoice information. This can include invoice numbers, customer names and contact details, descriptions, line items, quantities, prices, currency, tax and discount values, issue and due dates, invoice status, and business details displayed on the invoice.",
      "Payment and settlement information. When a payment flow is used, Nodus may process payment method and network selections, source and destination asset/network identifiers, receiving or deposit addresses, payment amounts, quote details and expiry, transaction identifiers, payment status, settlement records, and related verification evidence. Public blockchain data may also be visible through the relevant network's explorers.",
      "Receipt and feedback information. Nodus may process receipt numbers and issue times, plus ratings or comments submitted through invoice feedback.",
      "Technical and session information. Authentication session cookies and information needed to operate, protect, troubleshoot, and maintain the service may be processed by Nodus and its infrastructure providers.",
      "Public website analytics. Nodus records public page views, designated call-to-action clicks, referring website hostnames, and a pseudonymous first-party visitor identifier derived from a random cookie. This analytics feature does not collect IP addresses or full browser user-agent strings."
    ]
  },
  {
    title: "3. How we use information",
    body: [
      "We use information to create and display invoices, generate shareable invoice links, present checkout details, initiate and track payment attempts, verify settlement outcomes, issue payment receipts, show business activity, provide customer feedback features, authenticate users, prevent misuse, and maintain the reliability and security of Nodus.",
      "A payment is not treated as settled merely because a customer starts a payment. Nodus is designed to associate an invoice's paid status with a verified settlement outcome."
    ]
  },
  {
    title: "4. Wallets and blockchain payments",
    body: [
      "Businesses can configure a supported receiving network and wallet address. Customers may connect or use a compatible wallet to review and approve a payment. Wallet software, blockchain networks, and payment infrastructure may process information independently under their own terms and privacy policies.",
      "Nodus records payment workflow and settlement information needed to reconcile an invoice. Blockchain transactions and wallet addresses can be public, persistent, and linkable. Do not include information in a public transaction that you do not want publicly visible.",
      "Never share a wallet recovery phrase or private key with anyone claiming to represent Nodus. Review the network, asset, destination address, amount, and any fees in your wallet before approving a transaction. Blockchain transactions may be irreversible."
    ]
  },
  {
    title: "5. Service providers and disclosures",
    body: [
      "Nodus relies on infrastructure and payment technology providers to operate account authentication, database services, wallet/payment workflows, and supported blockchain integrations. The current application code uses WorkOS for account authentication, Supabase for database access, and Circle-related tooling for supported payment and wallet flows.",
      "Information may be processed by those providers as needed to deliver the features you use, and may be disclosed where required by law, to protect the service and its users, or to investigate fraud, abuse, or security incidents. Provider-specific processing is also subject to the providers' own terms and privacy notices."
    ]
  },
  {
    title: "6. Access, security, and retention",
    body: [
      "Nodus uses authenticated sessions for business areas and applies database access controls intended to restrict business records to the appropriate account. Public invoice links use share tokens and may have an expiry. These controls reduce exposure but cannot guarantee that a service or transmission is completely secure.",
      "We retain information for as long as needed to provide the service, maintain invoice and payment records, meet legitimate operational needs, resolve disputes, and comply with applicable obligations. Exact retention periods and deletion procedures depend on the deployed service configuration and applicable requirements.",
      "You should keep your account credentials secure and only enter customer information that you are permitted to use. If you believe an account or invoice link has been accessed improperly, stop sharing the link and contact the Nodus team through its official support channel."
    ]
  },
  {
    title: "7. Your choices and responsibilities",
    body: [
      "Businesses are responsible for the accuracy of the information they add to invoices and for providing any required privacy notice to their customers. Customers should contact the issuing business about corrections to invoice details. You may choose not to use a wallet or payment feature, but some checkout functionality will then be unavailable.",
      "Depending on applicable law, you may have rights to request access to, correction of, or deletion of personal information. Those rights may be limited where records must be retained for accounting, security, dispute-resolution, or legal reasons."
    ]
  },
  {
    title: "8. Changes and contact",
    body: [
      "We may update this policy as Nodus changes. The updated version will be published on this page with a revised date.",
      "Before public launch, Nodus should publish an official privacy contact and identify the legal entity responsible for the service. Do not treat this draft as a substitute for those launch details."
    ]
  }
];

export default async function PrivacyPage() {
  const cmsDocument = await getPublishedCmsDocument("privacy");
  if (cmsDocument?.kind === "legal") return <CmsPublicPage document={cmsDocument} eyebrow="NODUS / LEGAL" />;
  return (
    <main className="min-h-screen bg-white text-[#171816]">
      <div className="mx-auto w-full max-w-[820px] px-6 py-12 sm:px-10 sm:py-20">
        <Link href="/" className="inline-flex text-sm text-neutral-500 transition-colors hover:text-black">← Back to Nodus</Link>
        <header className="mt-14 border-b border-neutral-200 pb-10">
          <p className="text-[10px] font-medium uppercase tracking-[.2em] text-neutral-500">NODUS / LEGAL</p>
          <h1 className="mt-4 text-4xl font-medium tracking-[-.055em] sm:text-5xl">Privacy policy</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-neutral-600">How Nodus handles account, invoice, wallet, and payment information.</p>
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
        <p className="border-t border-neutral-200 pt-6 text-xs leading-6 text-neutral-500">This page describes the current product design and code-level integrations. It should be reviewed against the production deployment, provider agreements, retention settings, and applicable law before Nodus is launched publicly.</p>
        <div className="mt-8 flex gap-6 text-xs text-neutral-500"><Link href="/terms" className="hover:text-black">Terms of service</Link><Link href="/" className="hover:text-black">Home</Link></div>
      </div>
    </main>
  );
}
