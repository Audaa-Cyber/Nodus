import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { AppError } from "./app-error";
import { ErrorCodes } from "@/types/api";
import type { ApiResponse } from "@/types/api";

/**
 * Centralized API error handler for Next.js Route Handlers.
 *
 * Guarantees:
 * 1. Consistent JSON envelope on all errors.
 * 2. Operational errors preserve status codes and messages.
 * 3. Unhandled exceptions are logged server-side and sanitized before transmission to clients.
 * 4. Zero stack traces or server secrets leaked to the browser in production.
 */
export function handleApiError(error: unknown): NextResponse<ApiResponse<never>> {
  const isDev = process.env.NODE_ENV === "development";

  if (error instanceof AppError) {
    if (!error.isOperational) {
      console.error("[CRITICAL OPERATIONAL ERROR]", error);
    }

    return apiError({
      code: error.code,
      message: error.message,
      status: error.statusCode,
      details: error.details,
    });
  }

  // Handle standard Error instances (unexpected)
  if (error instanceof Error) {
    console.error("[UNHANDLED SERVER EXCEPTION]", {
      message: error.message,
      stack: error.stack,
    });

    return apiError({
      code: ErrorCodes.INTERNAL_SERVER_ERROR,
      message: isDev ? error.message : "An unexpected server error occurred",
      status: 500,
      details: isDev ? { stack: error.stack } : undefined,
    });
  }

  // Handle non-Error throws
  console.error("[UNKNOWN SERVER REJECTION]", error);

  return apiError({
    code: ErrorCodes.INTERNAL_SERVER_ERROR,
    message: "An unknown internal server error occurred",
    status: 500,
  });
}

