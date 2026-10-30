import { ApiError } from "./api-error.js";

export class NetworkError extends ApiError {
  constructor(
    message = "Network request failed",
    options?: ConstructorParameters<typeof ApiError>[1],
  ) {
    super(message, { code: "NETWORK", retryable: true, ...options });
    this.name = "NetworkError";
  }
}
