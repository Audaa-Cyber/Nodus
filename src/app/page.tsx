import type { Metadata } from "next";
import { HomePage } from "@/components/home-page";
import { getPublishedCmsDocument, getPublicCmsSettings } from "@/lib/cms/public";

export async function generateMetadata(): Promise<Metadata> {
  const [document, settings] = await Promise.all([
    getPublishedCmsDocument("homepage"),
    getPublicCmsSettings(),
  ]);
  const seo = (document?.seo ?? {}) as Record<string, unknown>;
  const title = typeof seo.title === "string" && seo.title.trim() ? seo.title : document?.title || settings.seoDefaultTitle;
  const description = typeof seo.description === "string" && seo.description.trim() ? seo.description : settings.seoDefaultDescription;
  const socialImage = typeof seo.socialImage === "string" && /^https:\/\//.test(seo.socialImage)
    ? seo.socialImage
    : settings.seoDefaultSocialImage ?? undefined;
  return {
    title,
    description,
    openGraph: { title, description, ...(socialImage ? { images: [{ url: socialImage }] } : {}) },
    twitter: { card: socialImage ? "summary_large_image" : "summary", title, description, ...(socialImage ? { images: [socialImage] } : {}) },
  };
}

export default async function Home() {
  const settings = await getPublicCmsSettings();
  return <HomePage announcementBanner={settings.announcementBanner} />;
}
