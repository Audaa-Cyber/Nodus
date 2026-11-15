import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/config/env.client";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";
  const mode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const isOAuthFlow = searchParams.get("flow") === "oauth";
  const providerError = searchParams.get("error");

  // Validate redirect target to prevent open redirect vulnerabilities
  const isAllowed = next.startsWith("/dashboard") || next.startsWith("/auth/reset-password");
  const target = isAllowed ? next : "/dashboard";

  // Check forwarded host for reverse proxies in production
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  const redirectOrigin = !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : origin;
  const authFailure = (reason: string) => {
    const authUrl = new URL(mode === "signup" ? "/register" : "/login", redirectOrigin);
    authUrl.searchParams.set("error", reason);
    if (isAllowed) authUrl.searchParams.set("next", target);
    return NextResponse.redirect(authUrl);
  };

  if (providerError) {
    const wasCancelled = providerError === "access_denied" || searchParams.get("error_code") === "user_cancelled";
    return authFailure(wasCancelled ? "oauth_cancelled" : "oauth_failed");
  }

  if (!code && !tokenHash) {
    return authFailure(isOAuthFlow ? "oauth_cancelled" : "confirmation");
  }

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = normalizeSupabaseUrl(rawUrl);

  if (!url || !anonKey || url.includes("your-project") || anonKey.includes("placeholder")) {
    return authFailure("auth_failed");
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

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return authFailure(isOAuthFlow ? "oauth_failed" : "expired");
      }
      if (mode === "signup" && isOAuthFlow && data.user) {
        const metadata = data.user.user_metadata ?? {};
        const providerName = [metadata.full_name, metadata.name].find(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        )?.trim().slice(0, 120);

        if (providerName) {
          try {
            const { data: business } = await supabase
              .from("business_profiles")
              .select("id,business_name")
              .eq("owner_user_id", data.user.id)
              .maybeSingle();

            if (business?.business_name === "My business") {
              await supabase
                .from("business_profiles")
                .update({ business_name: providerName })
                .eq("id", business.id);
            }
          } catch {
            // Do not turn a successful OAuth exchange into a failed sign-in for optional naming.
          }
        }
      }
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) {
        return authFailure("expired");
      }
    }

    return redirectResponse;
  } catch {
    // Prevent unhandled rejections from crashing the Next.js Turbopack dev server worker
    return authFailure("auth_failed");
  }
}
