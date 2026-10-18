export type MockApiErrorCode =
  | "INVALID_CONFIG"
  | "UNKNOWN_DATASET"
  | "NOT_FOUND"
  | "DUPLICATE_ID"
  | "INVALID_INPUT"
  | "INVALID_PAGINATION";

/** Every failure from `defineMockApi()` and its resources. Check `code`, not the message. */
export class MockApiError extends Error {
  readonly code: MockApiErrorCode;

  constructor(code: MockApiErrorCode, message: string) {
    super(message);
    this.name = "MockApiError";
    this.code = code;
  }
}
