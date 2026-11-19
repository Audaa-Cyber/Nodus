import Link from "next/link";
import { getPublishedCmsDocuments } from "@/lib/cms/public";

export const dynamic = "force-dynamic";
export const metadata = { title: "Updates | Nodus", description: "Announcements and product updates from Nodus." };

export default async function UpdatesPage() {
  const [announcements,changelog]=await Promise.all([getPublishedCmsDocuments("announcement"),getPublishedCmsDocuments("changelog")]);
  const items=[...announcements,...changelog].sort((a:any,b:any)=>new Date(b.published_at??b.updated_at).getTime()-new Date(a.published_at??a.updated_at).getTime());
  return <main className="min-h-screen bg-white text-[#17191c]"><div className="mx-auto max-w-[820px] px-6 py-16 sm:px-10 sm:py-24"><Link href="/" className="text-sm text-neutral-500 hover:text-black">← Back to Nodus</Link><header className="mt-16 border-b border-[#e5e8eb] pb-10"><p className="font-mono text-[10px] tracking-[.2em] text-[#929ba5]">NODUS / UPDATES</p><h1 className="mt-5 text-5xl font-medium tracking-[-.06em]">What’s changing.</h1><p className="mt-5 text-sm leading-7 text-[#737d88]">Product notes, announcements, and release updates.</p></header><div className="divide-y divide-[#edf0f2]">{items.map((item:any)=><article key={item.id} className="py-8"><div className="font-mono text-[9px] tracking-[.16em] text-[#929ba5]">{item.kind.toUpperCase()} · {new Date(item.published_at??item.updated_at).toLocaleDateString()}</div><h2 className="mt-3 text-xl font-medium">{item.title}</h2>{item.excerpt&&<p className="mt-3 text-sm text-[#737d88]">{item.excerpt}</p>}<p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#737d88]">{String(item.content?.body??item.content?.description??"")}</p></article>)}{!items.length&&<p className="py-10 text-sm text-[#737d88]">No public updates yet.</p>}</div></div></main>;
}
