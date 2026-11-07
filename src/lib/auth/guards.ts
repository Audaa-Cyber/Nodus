import "server-only";
import { getCurrentUser } from "./session";
import { AuthenticationError, ForbiddenError } from "@/lib/errors/app-error";
import type { AuthUser, UserRole } from "@/types/auth";

/**
 * Server guard: Enforces that a valid user session is present.
 * Throws an AuthenticationError (HTTP 401) if unauthenticated.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthenticationError("Authentication required to access this resource");
  }
  return user;
}

/**
 * Server guard: Enforces that the authenticated user possesses one of the allowed roles.
 * Throws a ForbiddenError (HTTP 403) if the role is insufficient.
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<AuthUser> {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenError(
      `Access denied. Required role: ${allowedRoles.join(" or ")}`
    );
  }
  return user;
}

