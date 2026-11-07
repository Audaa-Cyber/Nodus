import "server-only";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getClientEnv } from "@/config/env.client";
import type { Database } from "@/types/database";

/**
 * Session refresh utility for Next.js Middleware.
 * Refreshes auth tokens before route loaders run.
 * (Scaffolded for Phase 2 authentication integration).
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const env = getClientEnv();

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL || "https://unconfigured.supabase.co",
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "unconfigured-anon-key",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the auth token if expired
  await supabase.auth.getUser();

  return response;
}

