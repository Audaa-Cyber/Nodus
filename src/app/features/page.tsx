import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedCmsDocuments, getPublicCmsSettings } from "@/lib/cms/public";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicCmsSettings();
  const title = "Features | " + settings.seoDefaultTitle;
  const description = "Explore Nodus invoice, QR checkout, and payment workflow features.";
  return { title, description, openGraph: { title, description, ...(settings.seoDefaultSocialImage ? { images: [settings.seoDefaultSocialImage] } : {}) } };
}

export default async function FeaturesPage() {
  const items=await getPublishedCmsDocuments("feature");
  return <main className="min-h-screen bg-white text-[#17191c]"><div className="mx-auto max-w-[1040px] px-6 py-16 sm:px-10 sm:py-24"><Link href="/" className="text-sm text-neutral-500 hover:text-black">← Back to Nodus</Link><header className="mt-16 max-w-2xl"><p className="font-mono text-[10px] tracking-[.2em] text-[#929ba5]">NODUS / FEATURES</p><h1 className="mt-5 text-5xl font-medium tracking-[-.06em]">The details matter.</h1><p className="mt-5 text-sm leading-7 text-[#737d88]">A clearer workflow from itemized invoice to verified payment.</p></header><div className="mt-14 grid gap-4 sm:grid-cols-2">{items.map((item:any)=><article key={item.id} className="rounded-lg border border-[#e5e8eb] p-7"><p className="font-mono text-[9px] tracking-[.16em] text-[#929ba5]">FEATURE</p><h2 className="mt-4 text-xl font-medium tracking-tight"><Link href={`/features/${item.slug}`}>{item.title}</Link></h2>{item.excerpt&&<p className="mt-3 text-sm leading-7 text-[#737d88]">{item.excerpt}</p>}<p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#737d88]">{String(item.content?.body??item.content?.description??"")}</p></article>)}{!items.length&&<div className="rounded-lg border border-[#e5e8eb] p-8 text-sm text-[#737d88]">Feature descriptions are being prepared.</div>}</div></div></main>;
}
