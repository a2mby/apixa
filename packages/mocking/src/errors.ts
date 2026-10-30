export type MockApiErrorCode =
  | "INVALID_CONFIG"
  | "UNKNOWN_DATASET"
  | "NOT_FOUND"
  | "DUPLICATE_ID"
  | "INVALID_INPUT"
  | "INVALID_PAGINATION"
  | "INVALID_SLICE";

/**
 * Base class for every `@apixa/mocking` failure. Prefer checking `code` (and subclasses)
 * over message text.
 */
export class MockingErrors extends Error {
  readonly code: MockApiErrorCode;

  constructor(code: MockApiErrorCode, message: string) {
    super(message);
    this.name = "MockingErrors";
    this.code = code;
  }
}

/** Every failure from `defineMockApi()` and its resources. Check `code`, not the message. */
export class MockApiError extends MockingErrors {
  constructor(code: MockApiErrorCode, message: string) {
    super(code, message);
    this.name = "MockApiError";
  }
}

/** Invalid `slice` (negatives, non-integers, or `end` before `start`). */
export class InvalidSliceError extends MockApiError {
  constructor(message: string) {
    super("INVALID_SLICE", message);
    this.name = "InvalidSliceError";
  }
}
