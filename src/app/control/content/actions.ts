"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireControlContext, canEditContent } from "@/lib/control/access";

const allowedTypes = new Set(["homepage","feature","faq","announcement","changelog","privacy","terms","page"]);

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveContentAction(formData: FormData) {
  const context = await requireControlContext();
  if (!canEditContent(context.role)) redirect("/control/content?error=permission");
  const db = context.supabase as any;
  const id = readText(formData, "id");
  const contentType = readText(formData, "content_type");
  const title = readText(formData, "title");
  const slug = readText(formData, "slug").toLowerCase();
  const excerpt = readText(formData, "excerpt");
  const seoTitle = readText(formData, "seo_title");
  const seoDescription = readText(formData, "seo_description");
  const socialImageUrl = readText(formData, "social_image_url");
  const bodyText = readText(formData, "body");
  if (!allowedTypes.has(contentType) || !title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    redirect("/control/content?error=invalid");
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyText || "{}");
    if (!body || Array.isArray(body) || typeof body !== "object") throw new Error("Body must be a JSON object");
  } catch {
    redirect("/control/content?error=invalid-json");
  }
  const payload = {
    content_type: contentType, title, slug, excerpt: excerpt || null, body,
    seo_title: seoTitle || null, seo_description: seoDescription || null,
    social_image_url: socialImageUrl || null, updated_by: context.user.id,
    updated_at: new Date().toISOString(),
  };
  if (id) {
    const { error } = await db.from("cms_content").update(payload).eq("id", id);
    if (error) redirect("/control/content?error=save");
    revalidatePath("/control");
    revalidatePath("/control/content");
    redirect(`/control/content/${id}?saved=1`);
  }
  const { data, error } = await db.from("cms_content").insert({ ...payload, created_by: context.user.id }).select("id").single();
  if (error || !data?.id) redirect("/control/content?error=save");
  revalidatePath("/control");
  revalidatePath("/control/content");
  redirect(`/control/content/${data.id}?created=1`);
}

export async function publishContentAction(formData: FormData) {
  const context = await requireControlContext();
  if (!canEditContent(context.role)) redirect("/control/content?error=permission");
  const id = readText(formData, "id");
  const db = context.supabase as any;
  const { error } = await db.from("cms_content").update({
    status: "published", published_at: new Date().toISOString(),
    updated_by: context.user.id, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) redirect(`/control/content/${id}?error=publish`);
  revalidatePath("/");
  revalidatePath("/control");
  redirect(`/control/content/${id}?published=1`);
}

export async function archiveContentAction(formData: FormData) {
  const context = await requireControlContext();
  if (!canEditContent(context.role)) redirect("/control/content?error=permission");
  const id = readText(formData, "id");
  const db = context.supabase as any;
  const { error } = await db.from("cms_content").update({
    status: "archived", updated_by: context.user.id, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) redirect(`/control/content/${id}?error=archive`);
  revalidatePath("/");
  revalidatePath("/control");
  redirect("/control/content");
}
