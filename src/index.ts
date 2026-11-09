// The curated, framework-independent `apixa` entry. It only re-exports canonical implementations
// from `@apixa/core` and `@apixa/mocking`; the full Core surface is `apixa/core`, and React lives
// at `apixa/react`. Importing this file never loads React, TanStack Query or Node built-ins.

// Define APIs.
export { defineApi, defineApis } from "@apixa/core";
export { defineMockApi, MockApiError, InvalidSliceError } from "@apixa/mocking";

// Mock file storage (virtual files behind mocked resources).
export { mockFiles } from "@apixa/core";

// Download metadata.
export { parseContentDisposition } from "@apixa/core";

// Errors.
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
  SerializationError,
  MockError,
  isApiError,
  isHttpError,
  isTimeoutError,
  isMockError,
} from "@apixa/core";

// Transport, retry and transforms.
export {
  createFetchTransport,
  computeBackoffMs,
  parseRetryAfter,
  isRetryableStatus,
} from "@apixa/core";
export { convertKey, transformKeys, KEY_CASES } from "@apixa/core";

// Operation metadata.
export { OPERATION_METADATA, getOperationMetadata } from "@apixa/core";

export type {
  // Definitions and clients.
  ApiRootConfig,
  ResourceDefinition,
  OperationDefinition,
  OperationKind,
  OperationGroupName,
  OperationsBag,
  IdempotencyOption,
  QueryArrayFormat,
  MockOption,
  MockData,
  MockSource,
  ApiClient,
  ApisClient,
  ResourceClient,
  ApixaClient,
  MockedResource,
  FileFieldsConfig,
  ContentDisposition,
  FileFieldOptions,
  MultipartOptions,
  DataFormat,
  MockFileMeta,
  MockStoredFile,
  OperationKindsOf,
  EntityOf,
  IdOf,
  ListOf,
  QueryOf,
  PaginatedListOf,
  OperationFn,
  OperationFnContext,
  BuiltinOpName,
  AllBuiltinOpName,
  OperationMetadata,
  // Transport, retry and middleware.
  Transport,
  TransportRequest,
  TransportResponse,
  ApiRequest,
  ApiResponse,
  RequestConfig,
  RequestOptions,
  ResponseType,
  RetryConfig,
  RetryOption,
  RequestMiddleware,
  ResponseMiddleware,
  ErrorMiddleware,
  MiddlewareHooks,
  MiddlewareOptions,
  HttpMethod,
  // Transforms and errors.
  KeyCase,
  TransformsConfig,
  ApiErrorCode,
  MockErrorCode,
  // Datasets.
  MockDatasetId,
} from "@apixa/core";
export type {
  MockApi,
  MockApiConfig,
  MockApiConfigInput,
  MockApiResourceInput,
  MockResourceConfig,
  MockResource,
  MockOperationContext,
  MockOperationFn,
  MockApiErrorCode,
  Page,
  CursorPage,
  PaginationConfig,
  PageParams,
  ResourceInput,
  MockSlice,
  DatasetId,
} from "@apixa/mocking";
