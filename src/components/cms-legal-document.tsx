import Link from "next/link";
import { getPublishedCmsDocument } from "@/lib/cms/public";

export async function CmsLegalDocument({ slug, fallbackTitle }: { slug: "privacy" | "terms"; fallbackTitle: string }) {
  const document = await getPublishedCmsDocument(slug);
  const title = document?.title || fallbackTitle;
  const body = typeof document?.content?.body === "string" ? document.content.body : "";
  return <main className="min-h-screen bg-white text-[#17191c]">
    <div className="mx-auto max-w-[820px] px-6 py-16 sm:px-10 sm:py-24">
      <Link href="/" className="text-sm text-neutral-500 hover:text-black">← Back to Nodus</Link>
      <header className="mt-16 border-b border-[#e5e8eb] pb-10">
        <p className="font-mono text-[10px] tracking-[.2em] text-[#929ba5]">NODUS / LEGAL</p>
        <h1 className="mt-5 text-5xl font-medium tracking-[-.06em]">{title}</h1>
        {document?.updated_at && <p className="mt-4 text-xs text-[#929ba5]">Last updated {new Date(document.updated_at).toLocaleDateString()}</p>}
      </header>
      {body ? <article className="whitespace-pre-wrap py-10 text-sm leading-8 text-[#626d77]">{body}</article> : <p className="py-10 text-sm leading-7 text-[#737d88]">This document has not been published yet. Please check back soon.</p>}
    </div>
  </main>;
}
