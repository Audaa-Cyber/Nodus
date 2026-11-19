import { NextResponse } from "next/server";
import { createSupabaseAnonymousServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join("/");
  if (!/^[a-z0-9][a-z0-9/_-]{0,119}$/.test(path)) return new NextResponse(null, { status: 404 });
  const db = createSupabaseAnonymousServerClient() as any;
  const { data, error } = await db.from("cms_content")
    .select("content_type,slug,title,excerpt,body,seo_title,seo_description,social_image_url,published_at,updated_at")
    .eq("slug", path).eq("status", "published").maybeSingle();
  if (error || !data) return new NextResponse(null, { status: 404 });
  return NextResponse.json({
    kind: data.content_type, slug: data.slug, title: data.title, excerpt: data.excerpt,
    content: data.body ?? {}, seo: { title: data.seo_title, description: data.seo_description, socialImage: data.social_image_url },
    publishedAt: data.published_at, updatedAt: data.updated_at,
  }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
