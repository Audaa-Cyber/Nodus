import "server-only";
import { createCmsServiceClient } from "@/lib/cms/admin";

export async function getPublishedCmsDocument(slug: string) {
  try {
    const db = createCmsServiceClient();
    const { data, error } = await db.from("cms_documents").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
    return error ? null : data;
  } catch {
    return null;
  }
}

export async function getPublishedCmsDocuments(kind: string) {
  try {
    const db = createCmsServiceClient();
    const { data, error } = await db.from("cms_documents").select("*").eq("kind", kind).eq("status", "published").order("updated_at", { ascending: false }).limit(100);
    return error ? [] : data ?? [];
  } catch {
    return [];
  }
}


export type PublicCmsSettings = {
  announcementBanner: { enabled: boolean; text: string };
  faqEnabled: boolean;
  changelogEnabled: boolean;
  seoDefaultTitle: string;
  seoDefaultDescription: string;
  seoDefaultSocialImage: string | null;
};

export async function getPublicCmsSettings(): Promise<PublicCmsSettings> {
  const defaults: PublicCmsSettings = {
    announcementBanner: { enabled: false, text: "" },
    faqEnabled: true,
    changelogEnabled: true,
    seoDefaultTitle: "Nodus — Business payments, made clear",
    seoDefaultDescription: "Create itemized invoices, share a QR checkout, and keep payment status clear.",
    seoDefaultSocialImage: null,
  };
  try {
    const db = createCmsServiceClient();
    const keys = [
      "public_site.announcement_banner",
      "features.faq_enabled",
      "features.changelog_enabled",
      "seo.default_title",
      "seo.default_description",
      "seo.default_social_image",
    ];
    const { data, error } = await db.from("cms_settings").select("key,value").in("key", keys);
    if (error || !data) return defaults;
    const values = Object.fromEntries(data.map((row: {key:string;value:unknown}) => [row.key, row.value])) as Record<string, unknown>;
    const banner = values["public_site.announcement_banner"];
    const faq = values["features.faq_enabled"];
    const changelog = values["features.changelog_enabled"];
    const title = values["seo.default_title"];
    const description = values["seo.default_description"];
    const socialImage = values["seo.default_social_image"];
    return {
      announcementBanner: {
        enabled: typeof banner === "object" && banner !== null && "enabled" in banner && (banner as {enabled?:unknown}).enabled === true,
        text: typeof banner === "object" && banner !== null && "text" in banner && typeof (banner as {text?:unknown}).text === "string" ? (banner as {text:string}).text.slice(0, 240) : "",
      },
      faqEnabled: typeof faq === "object" && faq !== null && "enabled" in faq ? (faq as {enabled?:unknown}).enabled !== false : true,
      changelogEnabled: typeof changelog === "object" && changelog !== null && "enabled" in changelog ? (changelog as {enabled?:unknown}).enabled !== false : true,
      seoDefaultTitle: typeof title === "string" && title.trim() ? title.slice(0, 70) : defaults.seoDefaultTitle,
      seoDefaultDescription: typeof description === "string" && description.trim() ? description.slice(0, 180) : defaults.seoDefaultDescription,
      seoDefaultSocialImage: typeof socialImage === "string" && /^https:\/\//.test(socialImage) ? socialImage : null,
    };
  } catch {
    return defaults;
  }
}
