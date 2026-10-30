import { ApiError } from "./api-error.js";

export class ValidationError extends ApiError {
  constructor(
    message = "Response validation failed",
    options?: ConstructorParameters<typeof ApiError>[1],
  ) {
    super(message, { code: "VALIDATION", retryable: false, ...options });
    this.name = "ValidationError";
  }
}
