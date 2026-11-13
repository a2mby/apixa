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

/** A parsed response does not match the structural contract of an operation. */
export class ResponseShapeError extends ParseError {
  constructor(message: string, options?: ConstructorParameters<typeof ApiError>[1]) {
    super(message, { ...options, code: "RESPONSE_SHAPE" });
    this.name = "ResponseShapeError";
  }
}
