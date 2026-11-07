import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const isAllowed = next.startsWith("/dashboard") || next.startsWith("/auth/reset-password");
      const target = isAllowed ? next : "/dashboard";
      return NextResponse.redirect(new URL(target, origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=confirmation", origin));
}
