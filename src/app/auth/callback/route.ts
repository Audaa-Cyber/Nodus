import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { normalizeSupabaseUrl } from "@/config/env.client";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Validate redirect target to prevent open redirect vulnerabilities
  const isAllowed = next.startsWith("/dashboard") || next.startsWith("/auth/reset-password");
  const target = isAllowed ? next : "/dashboard";

  // Check forwarded host for reverse proxies in production
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  const redirectOrigin = !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : origin;

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=confirmation", redirectOrigin));
  }

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = normalizeSupabaseUrl(rawUrl);

  if (!url || !anonKey || url.includes("your-project") || anonKey.includes("placeholder")) {
    return NextResponse.redirect(new URL("/login?error=auth_failed", redirectOrigin));
  }

  try {
    const redirectResponse = NextResponse.redirect(new URL(target, redirectOrigin));

    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            redirectResponse.cookies.set(name, value, options);
          });
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      // In PKCE flow, if the user hits the back button or reuses a consumed code,
      // return a graceful redirect to login instead of throwing an unhandled error.
      return NextResponse.redirect(new URL("/login?error=expired", redirectOrigin));
    }

    return redirectResponse;
  } catch {
    // Prevent unhandled rejections from crashing the Next.js Turbopack dev server worker
    return NextResponse.redirect(new URL("/login?error=auth_failed", redirectOrigin));
  }
}
