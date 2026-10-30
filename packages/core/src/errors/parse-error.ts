import { ApiError } from "./api-error.js";

export class ParseError extends ApiError {
  constructor(
    message = "Failed to parse response",
    options?: ConstructorParameters<typeof ApiError>[1],
  ) {
    super(message, { code: "PARSE", retryable: false, ...options });
    this.name = "ParseError";
  }
}
