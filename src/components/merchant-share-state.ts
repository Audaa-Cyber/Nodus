export type MerchantShareState = "active" | "expired" | "none";

export function isActiveMerchantShare(state: MerchantShareState, expiresAt: string | null, now = Date.now()) {
  if (state !== "active" || !expiresAt) return false;
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

/** A browser cache cannot override revocation, expiry, or a regenerated link. */
export function resolveMerchantShareUrl(state: MerchantShareState, expiresAt: string | null, initialUrl?: string, cached?: unknown, now = Date.now()): string {
  if (!isActiveMerchantShare(state, expiresAt, now)) return "";
  if (initialUrl) return initialUrl;
  if (!cached || typeof cached !== "object" || Array.isArray(cached)) return "";
  const value = cached as Record<string, unknown>;
  return value.expiresAt === expiresAt && typeof value.url === "string" ? value.url : "";
}
