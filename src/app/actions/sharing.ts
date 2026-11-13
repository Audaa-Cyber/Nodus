"use server";

import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { getBusinessContext } from "@/lib/auth/business-context";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LINK_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

async function getAppBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
        return url.origin;
      }
    } catch {
      // Invalid URL
    }
  }

  // In development, dynamically detect the host from the current request if not explicitly configured
  if (process.env.NODE_ENV === "development") {
    try {
      const headerList = await headers();
      const host = headerList.get("x-forwarded-host") || headerList.get("host");
      const proto = headerList.get("x-forwarded-proto") || "http";
      if (host && (host.startsWith("localhost:") || host.startsWith("127.0.0.1:") || host === "localhost")) {
        return `${proto}://${host}`;
      }
    } catch {
      // Fallback if headers() is unavailable
    }
    return "http://localhost:3000";
  }

  return null;
}

export async function generateInvoiceShareLinkAction(invoiceId: string): Promise<{ url?: string; expiresAt?: string; error?: string }> {
  if (!UUID_PATTERN.test(invoiceId)) return { error: "Invoice not found." };

  const baseUrl = await getAppBaseUrl();
  if (!baseUrl) return { error: "Public invoice links are not configured for this site." };

  const { supabase, user, business } = await getBusinessContext();
  if (!user) return { error: "Sign in again to manage invoice links." };
  if (!business) return { error: "Business profile is unavailable." };

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const expiresAt = new Date(Date.now() + LINK_LIFETIME_MS).toISOString();
  // Prevent share-link generation for paid or cancelled invoices
  const { data: updated, error } = await supabase
    .from("invoices")
    .update({ share_token_hash: tokenHash, share_token_expires_at: expiresAt })
    .eq("id", invoiceId)
    .eq("business_id", business.id)
    .neq("status", "draft")
    .neq("status", "paid")
    .neq("status", "cancelled")
    .select("id")
    .maybeSingle();

  if (error || !updated) return { error: "A share link could not be created for this invoice. Paid and cancelled invoices cannot be reshared." };
  return { url: `${baseUrl}/pay/${token}`, expiresAt };
}

export async function revokeInvoiceShareLinkAction(invoiceId: string): Promise<{ success?: string; error?: string }> {
  if (!UUID_PATTERN.test(invoiceId)) return { error: "Invoice not found." };

  const { supabase, user, business } = await getBusinessContext();
  if (!user) return { error: "Sign in again to manage invoice links." };
  if (!business) return { error: "Business profile is unavailable." };

  const { data: updated, error } = await supabase
    .from("invoices")
    .update({ share_token_hash: null, share_token_expires_at: null })
    .eq("id", invoiceId)
    .eq("business_id", business.id)
    .select("id")
    .maybeSingle();

  if (error || !updated) return { error: "The share link could not be revoked." };
  return { success: "Share link revoked." };
}
