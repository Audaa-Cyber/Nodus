import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthUser, AuthSession } from "@/types/auth";

/**
 * Retrieves the currently authenticated Supabase user on the server.
 * Returns null if no active session exists or Supabase is unconfigured.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: (user.app_metadata?.role as AuthUser["role"]) || "customer",
      createdAt: user.created_at,
      updatedAt: user.updated_at || user.created_at,
      metadata: user.user_metadata,
    };
  } catch (error) {
    console.error("[AUTH ERROR] Failed to retrieve current user:", error);
    return null;
  }
}

/**
 * Retrieves the active authentication session.
 */
export async function getCurrentSession(): Promise<AuthSession | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return null;
    }

    const user = await getCurrentUser();
    if (!user) return null;

    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at || 0,
      user,
    };
  } catch (error) {
    console.error("[AUTH ERROR] Failed to retrieve session:", error);
    return null;
  }
}

