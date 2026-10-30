import { ApiError } from "./api-error.js";

export class TimeoutError extends ApiError {
  constructor(message = "Request timed out", options?: ConstructorParameters<typeof ApiError>[1]) {
    super(message, { code: "TIMEOUT", retryable: true, ...options });
    this.name = "TimeoutError";
  }
}
