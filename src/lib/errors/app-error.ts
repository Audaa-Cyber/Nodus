import { ErrorCodes, type ErrorCode } from "@/types/api";

/**
 * Base operational application error.
 * Distinguishes operational (expected business / client errors) from programming bugs.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode | string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: ErrorCode | string;
      details?: unknown;
      isOperational?: boolean;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? ErrorCodes.INTERNAL_SERVER_ERROR;
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;

    // Capture stack trace excluding constructor call from it
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Client request input validation failure (HTTP 400).
 */
export class ValidationError extends AppError {
  constructor(message = "Request validation failed", details?: unknown) {
    super(message, {
      statusCode: 400,
      code: ErrorCodes.VALIDATION_ERROR,
      details,
    });
  }
}

/**
 * Missing or invalid authentication token/session (HTTP 401).
 */
export class AuthenticationError extends AppError {
  constructor(message = "Authentication required", details?: unknown) {
    super(message, {
      statusCode: 401,
      code: ErrorCodes.UNAUTHENTICATED,
      details,
    });
  }
}

/**
 * Insufficient permissions for requested resource or action (HTTP 403).
 */
export class ForbiddenError extends AppError {
  constructor(message = "Access forbidden", details?: unknown) {
    super(message, {
      statusCode: 403,
      code: ErrorCodes.FORBIDDEN,
      details,
    });
  }
}

/**
 * Target resource does not exist (HTTP 404).
 */
export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details?: unknown) {
    super(message, {
      statusCode: 404,
      code: ErrorCodes.NOT_FOUND,
      details,
    });
  }
}

/**
 * State conflict or duplicate entry (HTTP 409).
 */
export class ConflictError extends AppError {
  constructor(message = "Resource state conflict", details?: unknown) {
    super(message, {
      statusCode: 409,
      code: ErrorCodes.CONFLICT,
      details,
    });
  }
}

/**
 * Client rate limit exceeded (HTTP 429).
 */
export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please try again later.", details?: unknown) {
    super(message, {
      statusCode: 429,
      code: ErrorCodes.RATE_LIMIT_EXCEEDED,
      details,
    });
  }
}

/**
 * Unexpected internal server error (HTTP 500).
 */
export class InternalServerError extends AppError {
  constructor(message = "An unexpected error occurred", details?: unknown) {
    super(message, {
      statusCode: 500,
      code: ErrorCodes.INTERNAL_SERVER_ERROR,
      details,
      isOperational: false,
    });
  }
}

/**
 * Missing or invalid system configuration (HTTP 500).
 */
export class ConfigurationError extends AppError {
  constructor(message = "System configuration error", details?: unknown) {
    super(message, {
      statusCode: 500,
      code: ErrorCodes.CONFIGURATION_ERROR,
      details,
      isOperational: true,
    });
  }
}

