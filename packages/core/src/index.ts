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
} from "./errors/index.js";

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
  ResourceDefinition,
  RequestOptions,
  ApiRootConfig,
  ApiState,
  ResourceState,
  OperationState,
  ApiInput,
  ApiClient,
  ResourceClient,
  ResourceMockConfigInput,
  MockDatasetIds,
  RetryConfig,
  ResolvedRetryConfig,
  Middleware,
  MiddlewareContext,
  MiddlewareNext,
} from "./types/index.js";
