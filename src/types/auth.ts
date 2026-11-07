/**
 * User roles supported within the NODUS platform authorization hierarchy.
 */
export type UserRole = "admin" | "merchant" | "operator" | "customer";

/**
 * Platform user profile model (scaffolded for Phase 2 Supabase Auth integration).
 */
export interface AuthUser {
  id: string;
  email?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Authentication session payload.
 */
export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  user: AuthUser;
}

/**
 * High-level authentication state for UI contexts.
 */
export interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

