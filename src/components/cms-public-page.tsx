import Link from "next/link";

type CmsSection = { title?: string; body?: string | string[]; description?: string };
type CmsPublicDocument = { title: string; slug: string; kind: string; content?: Record<string, unknown>; excerpt?: string | null };

export function CmsPublicPage({document,eyebrow="NODUS / PUBLICATION"}:{document:CmsPublicDocument;eyebrow?:string}) {
  const content=document.content??{};
  const sections=Array.isArray(content.sections)?content.sections as CmsSection[]:[];
  const paragraphs=typeof content.body==="string"?content.body.split(/\n{2,}/).filter(Boolean):[];
  return <main className="min-h-screen bg-white text-[#17191c]"><div className="mx-auto w-full max-w-[860px] px-6 py-12 sm:px-10 sm:py-20">
    <Link href="/" className="inline-flex text-sm text-neutral-500 transition-colors hover:text-black">← Back to Nodus</Link>
    <header className="mt-14 border-b border-[#e4e7ea] pb-10"><p className="font-mono text-[10px] tracking-[.2em] text-[#929ba5]">{eyebrow}</p><h1 className="mt-4 text-4xl font-medium tracking-[-.055em] sm:text-5xl">{document.title}</h1>{document.excerpt&&<p className="mt-5 max-w-2xl text-sm leading-7 text-[#737d88]">{document.excerpt}</p>}</header>
    <div className="divide-y divide-[#edf0f2]">
      {sections.map((section,index)=><section key={section.title??index} className="py-8"><h2 className="text-lg font-medium tracking-tight">{section.title??" "}</h2><div className="mt-4 space-y-4">{(Array.isArray(section.body)?section.body:typeof section.body==="string"?[section.body]:section.description?[section.description]:[]).map((paragraph,i)=><p key={i} className="text-sm leading-7 text-[#68717b]">{paragraph}</p>)}</div></section>)}
      {!sections.length&&paragraphs.map((paragraph,index)=><p key={index} className="py-5 text-sm leading-7 text-[#68717b]">{paragraph}</p>)}
      {!sections.length&&!paragraphs.length&&<div className="py-10 text-sm leading-7 text-[#68717b]">{String(content.description??"")}</div>}
    </div>
    <footer className="mt-12 border-t border-[#e4e7ea] pt-6 text-xs text-[#929ba5]">NODUS / BUSINESS PAYMENTS, MADE CLEAR</footer>
  </div></main>;
}
