// The curated, framework-independent `apixa` entry. It only re-exports canonical implementations
// from `@apixa/core` and `@apixa/mocking`; the full Core surface is `apixa/core`, and React lives
// at `apixa/react`. Importing this file never loads React, TanStack Query or Node built-ins.

// Define APIs.
export { defineApi, defineApis } from "@apixa/core";
export { defineMockApi, MockApiError, InvalidSliceError } from "@apixa/mocking";

// Mock file storage (virtual files behind mocked resources).
export { mockFiles } from "@apixa/core";

// Download metadata.
export { parseContentDisposition, detectTransferSupport } from "@apixa/core";

// Errors.
export {
  ApiError,
  NetworkError,
  HttpError,
  ParseError,
  ResponseShapeError,
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
  LayerOptions,
  QueryOptions,
  ResponseOptions,
  ResponseHookContext,
  ApiState,
  ApiStateOf,
  ResourceState,
  OperationState,
  ResourceDefinition,
  ResourcePagination,
  PaginationPreset,
  LaravelPagination,
  LaravelPaginatorPagination,
  LaravelCursorPagination,
  StrapiPagination,
  PayloadPagination,
  NestjsPagination,
  PaginationFields,
  PaginationParams,
  PageResult,
  ResolvedPagination,
  PaginationMode,
  PaginationQueryOf,
  OperationDefinition,
  OperationKind,
  OperationPreset,
  OperationSelection,
  OperationsBag,
  IdempotencyOption,
  QueryArrayFormat,
  MockOption,
  MockData,
  MockSource,
  MockStorageOptions,
  MockFileFilter,
  MockFileFixture,
  MockFileFixtures,
  MockFixtureRef,
  OperationMockHandler,
  OperationMockContext,
  MockStoreHandle,
  MockFilesHandle,
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
  ExtendedBuiltinOpName,
  AllBuiltinOpName,
  OperationMetadata,
  // Transport, retry and middleware.
  Transport,
  TransportRequest,
  TransportResponse,
  ApiRequest,
  ApiResponse,
  RequestOptions,
  ResponseType,
  FileRules,
  FileLimits,
  FileViolation,
  FileViolationCode,
  TransferDirection,
  TransferEvent,
  TransferObserver,
  TransferPhase,
  TransferSupport,
  TransportTransferEvent,
  RetryConfig,
  RetryOption,
  RetryHookContext,
  RequestMiddleware,
  ResponseMiddleware,
  ErrorMiddleware,
  MiddlewareHooks,
  MiddlewareOptions,
  HttpMethod,
  // Transforms and errors.
  KeyCase,
  KeyTransformConfig,
  TransformsConfig,
  TransformKeys,
  ConvertKey,
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
