export {
  defineApi,
  registerDefineApiProcessor,
  clearDefineApiProcessors,
  setMockingRegisterLoaderForTests,
} from "./api/index.js";
export type { DefineApiProcessor, DefineApiConfigBag } from "./api/index.js";

export {
  ApiError,
  NetworkError,
  HttpError,
  ParseError,
  ValidationError,
  TimeoutError,
  AbortError,
  isApiError,
  isHttpError,
  isTimeoutError,
} from "./errors/index.js";
export type { ApiErrorCode } from "./errors/index.js";

export { createFetchTransport } from "./transport/index.js";

export type {
  HttpMethod,
  PathParams,
  QueryParams,
  HeadersInitLike,
  BuiltinHeaders,
  RequestConfig,
  ApiResponse,
  TransportRequest,
  TransportResponse,
  Transport,
  OperationDefinition,
  RequestOptions,
  ResponseType,
  ApiRootConfig,
  ApiState,
  ResourceState,
  OperationState,
  ResourceRuntimeInput,
  QueryArrayFormat,
  ApiInput,
  ApiClient,
  ResourceClient,
  MockDatasetIds,
  RetryConfig,
  ResolvedRetryConfig,
  RetryHookContext,
  Middleware,
  MiddlewareContext,
  MiddlewareNext,
  ResourceExtensions,
  OperationExtensions,
  ListOf,
  QueryOf,
  CallResult,
} from "./types/index.js";
