/**
 * Standard API error payload returned when an API request fails.
 */
export interface ApiErrorPayload {
  /**
   * Machine-readable error code (e.g., 'VALIDATION_ERROR', 'UNAUTHENTICATED').
   */
  code: string;

  /**
   * Human-readable, developer/user friendly error description.
   */
  message: string;

  /**
   * Optional field-level validation errors or debugging details (non-sensitive).
   */
  details?: unknown;
}

/**
 * Metadata attached to standard API responses.
 */
export interface ApiMeta {
  /**
   * ISO 8601 timestamp of response generation.
   */
  timestamp: string;

  /**
   * Correlation / request identifier for distributed tracing.
   */
  requestId?: string;

  /**
   * API version string.
   */
  version?: string;

  /**
   * Optional pagination metadata.
   */
  pagination?: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };

  [key: string]: unknown;
}

/**
 * Standardized, strictly-typed JSON API response envelope.
 * All API routes across the NODUS platform conform to this envelope.
 */
export interface ApiResponse<T = unknown> {
  /**
   * Indicates whether the requested operation succeeded.
   */
  success: boolean;

  /**
   * The response payload, present only when success is true.
   */
  data?: T;

  /**
   * The error payload, present only when success is false.
   */
  error?: ApiErrorPayload;

  /**
   * Metadata including timestamp and trace information.
   */
  meta?: ApiMeta;
}

/**
 * Standardized error code identifiers across NODUS services.
 */
export const ErrorCodes = {
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

