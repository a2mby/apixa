import { ApiError } from "./api-error.js";

export class AbortError extends ApiError {
  constructor(
    message = "Request was aborted",
    options?: ConstructorParameters<typeof ApiError>[1],
  ) {
    super(message, { code: "ABORT", retryable: false, ...options });
    this.name = "AbortError";
  }
}
