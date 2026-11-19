import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedCmsDocuments, getPublicCmsSettings } from "@/lib/cms/public";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicCmsSettings();
  const title = "FAQs | " + settings.seoDefaultTitle;
  const description = "Answers to common questions about Nodus.";
  return { title, description, openGraph: { title, description, ...(settings.seoDefaultSocialImage ? { images: [settings.seoDefaultSocialImage] } : {}) } };
}

export default async function FaqPage() {
  const settings = await getPublicCmsSettings();
  if (!settings.faqEnabled) notFound();
  const items=await getPublishedCmsDocuments("faq");
  return <main className="min-h-screen bg-white text-[#17191c]"><div className="mx-auto max-w-[820px] px-6 py-16 sm:px-10 sm:py-24"><Link href="/" className="text-sm text-neutral-500 hover:text-black">← Back to Nodus</Link><header className="mt-16 border-b border-[#e5e8eb] pb-10"><p className="font-mono text-[10px] tracking-[.2em] text-[#929ba5]">NODUS / HELP</p><h1 className="mt-5 text-5xl font-medium tracking-[-.06em]">Questions, answered.</h1><p className="mt-5 text-sm leading-7 text-[#737d88]">The essentials about invoices, checkout, wallets, and settlement.</p></header><div className="divide-y divide-[#edf0f2]">{items.map((item:any)=><section key={item.id} className="py-7"><h2 className="text-lg font-medium">{String(item.content?.question??item.title)}</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#737d88]">{String(item.content?.answer??item.content?.body??item.excerpt??"")}</p></section>)}{!items.length&&<p className="py-10 text-sm text-[#737d88]">FAQs are being prepared.</p>}</div></div></main>;
}
