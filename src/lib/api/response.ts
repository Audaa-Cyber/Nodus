import { NextResponse } from "next/server";
import type { ApiResponse, ApiErrorPayload, ApiMeta } from "@/types/api";
import { APP_CONFIG } from "@/config/constants";

/**
 * Options for constructing a successful API response envelope.
 */
export interface ApiSuccessOptions {
  status?: number;
  meta?: Record<string, unknown>;
  headers?: HeadersInit;
}

/**
 * Options for constructing an error API response envelope.
 */
export interface ApiErrorOptions {
  code: string;
  message: string;
  status?: number;
  details?: unknown;
  headers?: HeadersInit;
}

/**
 * Creates standard response metadata.
 */
function createMeta(customMeta?: Record<string, unknown>): ApiMeta {
  return {
    timestamp: new Date().toISOString(),
    version: APP_CONFIG.version,
    ...customMeta,
  };
}

/**
 * Produces a standardized, strictly-typed success response.
 *
 * @param data The payload to return.
 * @param options Optional HTTP status, custom metadata, and headers.
 */
export function apiSuccess<T>(
  data: T,
  options: ApiSuccessOptions = {}
): NextResponse<ApiResponse<T>> {
  const { status = 200, meta, headers } = options;

  const payload: ApiResponse<T> = {
    success: true,
    data,
    meta: createMeta(meta),
  };

  return NextResponse.json(payload, { status, headers });
}

/**
 * Produces a standardized, strictly-typed error response.
 *
 * @param options Error configuration: code, message, HTTP status, and non-sensitive details.
 */
export function apiError(
  options: ApiErrorOptions
): NextResponse<ApiResponse<never>> {
  const { code, message, status = 400, details, headers } = options;

  const errorPayload: ApiErrorPayload = {
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  };

  const payload: ApiResponse<never> = {
    success: false,
    error: errorPayload,
    meta: createMeta(),
  };

  return NextResponse.json(payload, { status, headers });
}

