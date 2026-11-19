import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CmsPublicPage } from "@/components/cms-public-page";
import { getPublishedCmsDocument, getPublicCmsSettings } from "@/lib/cms/public";

type Params = { slug: string[] };
async function getDocument(params: Promise<Params>) {
  const { slug } = await params;
  const document = await getPublishedCmsDocument(slug.join("/"));
  return document?.kind === "faq" ? document : null;
}
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const [document, settings] = await Promise.all([getDocument(params), getPublicCmsSettings()]);
  if (!document) return { title: "Nodus FAQ" };
  const seo = (document.seo ?? {}) as Record<string, unknown>;
  const title = typeof seo.title === "string" && seo.title.trim() ? seo.title : document.title;
  const description = typeof seo.description === "string" && seo.description.trim() ? seo.description : settings.seoDefaultDescription;
  const image = typeof seo.socialImage === "string" && /^https:\/\//.test(seo.socialImage) ? seo.socialImage : settings.seoDefaultSocialImage;
  return { title, description, openGraph: { title, description, ...(image ? { images: [image] } : {}) }, twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image ? { images: [image] } : {}) } };
}
export default async function FaqDetailPage({ params }: { params: Promise<Params> }) {
  const document = await getDocument(params);
  if (!document) notFound();
  return <CmsPublicPage document={document} eyebrow="NODUS / FAQ" />;
}
