import { NextResponse } from "next/server";
import { createCmsServiceClient } from "@/lib/cms/admin";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join("/");
  if (!/^[a-z0-9][a-z0-9/_-]{0,119}$/.test(path)) return new NextResponse(null,{status:404});
  const db = createCmsServiceClient();
  const { data, error } = await db.from("cms_documents")
    .select("kind,slug,title,content,seo,published_at,updated_at")
    .eq("slug",path).eq("status","published").maybeSingle();
  if (error || !data) return new NextResponse(null,{status:404});
  return NextResponse.json(data,{headers:{"Cache-Control":"public, s-maxage=60, stale-while-revalidate=300"}});
}
