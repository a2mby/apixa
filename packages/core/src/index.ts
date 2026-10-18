export { defineApi } from "./api/index.js";

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

import { type as typeMarker } from "./types/index.js";
export { typeMarker as type };
export type { Type, Infer } from "./types/index.js";

export type {
  HttpMethod,
  PathParams,
  QueryParams,
  HeadersInitLike,
  RequestConfig,
  ApiResponse,
  TransportRequest,
  TransportResponse,
  Transport,
  OperationDefinition,
  ResourceDefinition,
  RequestOptions,
  ApiRootConfig,
  ApiClient,
  ResourceClient,
} from "./types/index.js";
