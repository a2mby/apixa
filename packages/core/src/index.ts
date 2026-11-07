export { defineApi, defineApis, resetMock } from "./api/index.js";
export { OPERATION_METADATA, getOperationMetadata, createIdempotencyKey } from "./api/metadata.js";
export type { OperationMetadata } from "./api/metadata.js";

export {
  ApiError,
  NetworkError,
  HttpError,
  ParseError,
  ValidationError,
  TimeoutError,
  AbortError,
  ConfigError,
  SecurityError,
  TransformError,
  MockError,
  isApiError,
  isHttpError,
  isTimeoutError,
  isMockError,
} from "./errors/index.js";
export type { ApiErrorCode, MockErrorCode } from "./errors/index.js";

export { createFetchTransport } from "./transport/index.js";

/** Retry helpers (pure; exported for custom `shouldRetry` policies and tests). */
export { computeBackoffMs, parseRetryAfter, isRetryableStatus } from "./request/index.js";

/** Shared in-memory mock engine (used by Core mocked resources and `@apixa/mocking`). */
export {
  MockStore,
  runBuiltin,
  normalizeMockSource,
  MOCK_DATASETS,
  isMockDatasetId,
  listMockDatasetIds,
  registerMockDatasetLoader,
} from "./mock/index.js";
export type {
  MockSource,
  MockDatasetLoader,
  BuiltinIntent,
  MockResult,
  PaginationMode,
} from "./mock/index.js";
export { applyResourceSliceToListResult } from "./utils/slice.js";

/** Operation selection (defaults, groups, `readOnly` / `writeOnly`) shared with `@apixa/mocking`. */
export { expandOperations, BUILTIN_CONVENTIONS } from "./operation/index.js";

export { convertKey, transformKeys, KEY_CASES } from "./transform/index.js";

export type * from "./types/index.js";
