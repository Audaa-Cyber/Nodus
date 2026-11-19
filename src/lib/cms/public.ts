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
