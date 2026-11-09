import { ApiError } from "./api-error.js";

/**
 * A request body could not be encoded: an unsupported value (function, symbol, class instance,
 * `FileList`, cycle, too deep), or binary values under `dataFormat: "json"`. The message and
 * `path` name the field only — never its value or any binary data.
 */
export class SerializationError extends ApiError {
  /** Location of the offending value, e.g. `$.gallery[2]`. */
  readonly path: string;

  constructor(
    message: string,
    details: { path: string },
    options?: ConstructorParameters<typeof ApiError>[1],
  ) {
    super(message, { code: "SERIALIZATION", retryable: false, ...options });
    this.name = "SerializationError";
    this.path = details.path;
  }
}
