/**
 * Validate destination URL to ensure it is strictly a trusted internal dashboard route.
 * Prevents arbitrary external redirects or protocol injections.
 */
export function getSafeInternalDestination(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  // Only permit /dashboard/invoices/{uuid-or-id}
  if (/^\/dashboard\/invoices\/[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Format timestamp into human-readable relative duration.
 */
export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(diffMs)) return dateString;

    const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
    if (diffSecs < 60) return "Just now";

    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateString;
  }
}
