import { ApiError } from "./api-error.js";

/** The final destination left the configured API origin; the request was never sent. */
export class SecurityError extends ApiError {
  constructor(message: string, options?: ConstructorParameters<typeof ApiError>[1]) {
    super(message, { code: "SECURITY", retryable: false, ...options });
    this.name = "SecurityError";
  }
}
