import type { ApiErrorCode } from "../types/errors.js";
import { ApiError } from "./api-error.js";

export type MockErrorCode = Extract<ApiErrorCode, `MOCK_${string}`>;

const STATUS: Record<MockErrorCode, number | undefined> = {
  MOCK_NOT_FOUND: 404,
  MOCK_DUPLICATE_ID: 409,
  MOCK_INVALID_INPUT: 400,
  MOCK_UNSUPPORTED: 501,
  MOCK_LOAD: undefined,
};

/** Failure inside the in-memory mock engine. Carries an HTTP-like `status` where one applies. */
export class MockError extends ApiError {
  declare code: MockErrorCode;

  constructor(code: MockErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, { code, status: STATUS[code], retryable: false, cause: options?.cause });
    this.name = "MockError";
  }
}
