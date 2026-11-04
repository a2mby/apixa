import { ApiError } from "./api-error.js";

/** Key transformation failed — for example `user_id` and `userId` both become `userId`. */
export class TransformError extends ApiError {
  /** Dotted location of the object that failed, e.g. `$.items[0].profile`. */
  readonly path: string;
  readonly keys: readonly string[];

  constructor(
    message: string,
    details: { path: string; keys: readonly string[] },
    options?: ConstructorParameters<typeof ApiError>[1],
  ) {
    super(message, { code: "TRANSFORM", retryable: false, ...options });
    this.name = "TransformError";
    this.path = details.path;
    this.keys = details.keys;
  }
}
