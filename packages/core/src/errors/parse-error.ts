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

type ShapeErrorOptions = NonNullable<ConstructorParameters<typeof ApiError>[1]> & {
  missingIds?: readonly (string | number)[];
  extraIds?: readonly (string | number)[];
  duplicateIds?: readonly (string | number)[];
};

/**
 * A decoded response does not match the structural contract of a builtin operation (an array for
 * `getAll`, a number for `count`, exactly the requested records for `getMany`, …). Distinct from
 * `ParseError` (undecodable wire content) and from a schema rejection (`VALIDATION_ERROR`).
 */
export class ResponseShapeError extends ParseError {
  /** `getMany`: requested ids the backend did not return. */
  readonly missingIds?: readonly (string | number)[];
  /** `getMany`: returned ids that were not requested. */
  readonly extraIds?: readonly (string | number)[];
  /** `getMany`: ids the backend returned more than once. */
  readonly duplicateIds?: readonly (string | number)[];

  constructor(message: string, options?: ShapeErrorOptions) {
    const { missingIds, extraIds, duplicateIds, ...rest } = options ?? {};
    super(message, { ...rest, code: "RESPONSE_SHAPE" });
    this.name = "ResponseShapeError";
    if (missingIds?.length) this.missingIds = Object.freeze([...missingIds]);
    if (extraIds?.length) this.extraIds = Object.freeze([...extraIds]);
    if (duplicateIds?.length) this.duplicateIds = Object.freeze([...duplicateIds]);
  }
}
