import type { Metadata } from "next";

export function cmsMetadata(document: any, fallback: {title:string;description:string}): Metadata {
  const seo = (document?.seo ?? {}) as Record<string, unknown>;
  const title = typeof seo.title === "string" && seo.title.trim() ? seo.title : document?.title || fallback.title;
  const description = typeof seo.description === "string" && seo.description.trim() ? seo.description : document?.excerpt || fallback.description;
  const image = typeof seo.socialImage === "string" && /^https:\/\//.test(seo.socialImage) ? seo.socialImage : undefined;
  return {
    title, description,
    openGraph: { title, description, ...(image ? { images: [{url:image}] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image ? {images:[image]} : {}) },
  };
}
