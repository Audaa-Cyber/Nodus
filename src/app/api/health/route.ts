import { apiSuccess, apiError } from "@/lib/api/response";
import { isClientSupabaseConfigured } from "@/config/env.client";
import { isServerSupabaseConfigured } from "@/config/env.server";
import { isNearServerConfigured } from "@/lib/server/near-boundary";
import { APP_CONFIG } from "@/config/constants";

export const dynamic = "force-dynamic";

/**
 * Canonical Health Check API Route.
 *
 * Verifies system availability, returns platform metadata conforming to the
 * standard ApiResponse envelope, and inspects service configuration readiness.
 */
export async function GET() {
  try {
    return apiSuccess({
      status: "healthy",
      name: APP_CONFIG.name,
      version: APP_CONFIG.version,
      environment: process.env.NODE_ENV || "development",
      services: {
        supabaseClient: {
          configured: isClientSupabaseConfigured(),
        },
        supabaseAdmin: {
          configured: isServerSupabaseConfigured(),
        },
        nearIntents: {
          configured: isNearServerConfigured(),
          phase: "Phase 2 (Scaffolded)",
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health check failed";
    return apiError({
      code: "HEALTH_CHECK_FAILED",
      message,
      status: 500,
    });
  }
}

