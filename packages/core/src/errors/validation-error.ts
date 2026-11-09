import type { FileViolation } from "../types/errors.js";
import { ApiError } from "./api-error.js";

/** Most violations one error carries; the rest are dropped (the first ones are the useful ones). */
export const MAX_VIOLATIONS = 20;

type ValidationErrorOptions = NonNullable<ConstructorParameters<typeof ApiError>[1]> & {
  /** Broken file rules. Locations and numbers only: never contents or file names. */
  violations?: readonly FileViolation[];
};

export class ValidationError extends ApiError {
  /** Broken file rules (empty for other validation failures such as a missing path parameter). */
  readonly violations: readonly FileViolation[];

  constructor(message = "Response validation failed", options?: ValidationErrorOptions) {
    const { violations, ...rest } = options ?? {};
    super(message, { code: "VALIDATION", retryable: false, ...rest });
    this.name = "ValidationError";
    this.violations = Object.freeze((violations ?? []).slice(0, MAX_VIOLATIONS));
  }
}

/** A file-rule failure: the message lists codes and locations, never values. */
export function fileValidationError(
  violations: readonly FileViolation[],
  options?: NonNullable<ConstructorParameters<typeof ApiError>[1]>,
): ValidationError {
  const shown = violations.slice(0, MAX_VIOLATIONS);
  const list = shown.map((v) => `${v.code} at ${v.path}`).join(", ");
  return new ValidationError(
    `File validation failed (${violations.length > shown.length ? `${shown.length}+` : shown.length} violation${shown.length === 1 ? "" : "s"}): ${list}`,
    { ...options, violations: shown },
  );
}
