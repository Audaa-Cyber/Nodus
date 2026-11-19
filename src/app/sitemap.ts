import type { MetadataRoute } from "next";
import { getPublishedCmsDocuments, getPublicCmsSettings } from "@/lib/cms/public";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!base) return [];

  const [features, faqs, announcements, changelog, settings] = await Promise.all([
    getPublishedCmsDocuments("feature"),
    getPublishedCmsDocuments("faq"),
    getPublishedCmsDocuments("announcement"),
    getPublishedCmsDocuments("changelog"),
    getPublicCmsSettings(),
  ]);

  const staticRoutes = ["", "/features", "/faq", "/updates", "/privacy", "/terms"].map((path) => ({
    url: base + path,
    lastModified: new Date(),
    changeFrequency: path === "" ? "weekly" as const : "monthly" as const,
    priority: path === "" ? 1 : 0.6,
  }));

  const contentRoutes = [
    ...features.map((doc) => ({ doc, prefix: "/features/" })),
    ...faqs.map((doc: any) => ({ doc, prefix: "/faq/" })),
    ...announcements.map((doc: any) => ({ doc, prefix: "/updates/" })),
    ...(settings.changelogEnabled ? changelog.map((doc: any) => ({ doc, prefix: "/updates/" })) : []),
  ].map(({ doc, prefix }) => ({
    url: base + prefix + String(doc.slug).split("/").map(encodeURIComponent).join("/"),
    lastModified: new Date(doc.updated_at),
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  return [...staticRoutes, ...contentRoutes];
}
