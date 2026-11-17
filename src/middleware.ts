import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeSupabaseUrl } from "@/config/env.client";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = normalizeSupabaseUrl(rawUrl);

  if (!url || !anonKey || url.includes("your-project") || anonKey.includes("placeholder")) {
    if (request.nextUrl.pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(new URL("/login?next=/dashboard", request.url));
    }
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isAuthPage =
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/register" ||
    request.nextUrl.pathname === "/forgot-password";

  const allCookies = request.cookies.getAll();
  const hasAuthCookie = allCookies.some(
    (c) =>
      c.name.startsWith("sb-") &&
      (c.name.includes("-auth-token") || c.name.includes("-token")) &&
      !c.name.includes("-code-verifier")
  );

  // Fast path for unauthenticated users: avoid blocking remote network calls to Supabase
  if (isAuthPage && !hasAuthCookie) {
    return response;
  }

  if (isDashboard && !hasAuthCookie) {
    const redirectUrl = new URL(`/login?next=${encodeURIComponent(request.nextUrl.pathname)}`, request.url);
    const redirectResponse = NextResponse.redirect(redirectUrl);
    response.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c));
    return redirectResponse;
  }

  let user = null;
  try {
    // Fast local path: decode the access token from the cookie without a network call.
    // The access token lasts ~1 hour, so routine dashboard navigation resolves here
    // instantly instead of issuing a blocking GoTrue /user round trip on every hop.
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user ?? null;

    // Only touch the network when there is no usable local session (first visit,
    // refresh-token-only cookie, or an expired access token).
    if (!user) {
      const { data } = await supabase.auth.getUser();
      user = data?.user ?? null;
    }
  } catch {
    user = null;
  }

  if (isDashboard && !user) {
    const redirectUrl = new URL(`/login?next=${encodeURIComponent(request.nextUrl.pathname)}`, request.url);
    const redirectResponse = NextResponse.redirect(redirectUrl);
    response.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c));
    return redirectResponse;
  }

  if (isAuthPage && user) {
    const redirectResponse = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c));
    return redirectResponse;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-user-id");
  requestHeaders.delete("x-user-email");

  if (isDashboard && user) {
    requestHeaders.set("x-user-id", user.id);
    if (user.email) {
      requestHeaders.set("x-user-email", user.email);
    }
  }

  const finalResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.cookies.getAll().forEach((c) => finalResponse.cookies.set(c));

  if (isAuthPage) {
    finalResponse.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  }

  return finalResponse;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register", "/forgot-password", "/auth/reset-password"],
};
