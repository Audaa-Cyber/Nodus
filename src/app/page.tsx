import type { Metadata } from "next";
import { HomePage } from "@/components/home-page";
import { getPublishedCmsDocument } from "@/lib/cms/public";

export async function generateMetadata(): Promise<Metadata> {
  const document = await getPublishedCmsDocument("homepage");
  const seo = (document?.seo ?? {}) as Record<string, unknown>;
  const title = typeof seo.title === "string" && seo.title.trim() ? seo.title : document?.title || "Nodus — Business payments, made clear";
  const description = typeof seo.description === "string" && seo.description.trim()
    ? seo.description
    : "Create itemized bills, let guests pay by QR code with supported stablecoins, and give every completed payment a clear digital receipt.";
  const socialImage = typeof seo.socialImage === "string" && /^https:\/\//.test(seo.socialImage) ? seo.socialImage : undefined;
  return {
    title,
    description,
    openGraph: { title, description, ...(socialImage ? { images: [{ url: socialImage }] } : {}) },
    twitter: { card: socialImage ? "summary_large_image" : "summary", title, description, ...(socialImage ? { images: [socialImage] } : {}) },
  };
}

export default function Home() {
  return <HomePage />;
}
