import { ValidationError } from "@/lib/errors/app-error";

export type ValidationRule<T> = (value: unknown) => {
  valid: boolean;
  message?: string;
  sanitized?: T;
};

/**
 * Validates raw JSON payload against a type validator schema.
 * Throws a ValidationError if requirements are not met.
 */
export async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    const body = await request.json();
    return body as T;
  } catch {
    throw new ValidationError("Invalid JSON in request body");
  }
}

/**
 * Validates an object against a set of field validators.
 */
export function validateFields<T extends Record<string, unknown>>(
  data: unknown,
  schema: { [K in keyof T]: (val: unknown) => boolean | string }
): T {
  if (!data || typeof data !== "object") {
    throw new ValidationError("Request payload must be a non-null object");
  }

  const record = data as Record<string, unknown>;
  const errors: Record<string, string> = {};

  for (const [key, validator] of Object.entries(schema)) {
    const val = record[key];
    const result = validator(val);
    if (result === false) {
      errors[key] = `Field '${key}' is invalid`;
    } else if (typeof result === "string") {
      errors[key] = result;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("Validation failed for one or more fields", errors);
  }

  return record as T;
}

