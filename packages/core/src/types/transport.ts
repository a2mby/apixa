import type { HeadersInitLike, HttpMethod, PathParams, QueryParams } from "./http.js";
import type { RetryConfig } from "./retry.js";

export type ResponseType = "json" | "text" | "blob" | "arrayBuffer" | "stream";

/**
 * One logical request as request/response/error middleware sees it. Created once per call
 * (retries reuse it), so middleware runs once per call, not once per attempt.
 */
export interface ApiRequest {
  method: HttpMethod;
  /** Final destination. Changing it in middleware is allowed but re-checked against the API origin. */
  url: string;
  /** Interpolated path relative to `baseURL` (or an absolute same-origin operation URL). */
  path: string;
  baseURL: string;
  headers: Headers;
  params?: PathParams;
  /** Wire query (after request key transforms). */
  query?: QueryParams;
  /** Public body (request key transforms run after request middleware, at serialization). */
  body?: unknown;
  signal: AbortSignal;
  timeout?: number;
  meta: Record<string, unknown>;
  /** `resources` key that issued the call. */
  resource: string;
  /** Operation name (builtin or custom). */
  operation: string;
  /** True when the resource is mocked — the request will never reach the network. */
  mocked: boolean;
}

/** @deprecated Renamed to `ApiRequest`. */
export type RequestConfig = ApiRequest;

/** Response envelope for response middleware and `{ full: true }` calls. */
export interface ApiResponse<T> {
  /** Parsed body after response key transforms. */
  data: T;
  status: number;
  headers: Headers;
  request: ApiRequest;
  /** Underlying `Response` for HTTP calls; absent for mocked calls. */
  raw?: Response;
}

export interface TransportRequest {
  url: string;
  method: HttpMethod;
  headers: Headers;
  body?: BodyInit | null;
  signal?: AbortSignal;
  responseType?: ResponseType;
}

export interface TransportResponse {
  status: number;
  headers: Headers;
  raw: Response;
  /** Parsed body according to responseType / content-type. */
  body: unknown;
}

export interface Transport {
  request(input: TransportRequest): Promise<TransportResponse>;
}

/** Per-call options, always the last argument of an operation. */
export type RequestOptions<TQuery = QueryParams> = {
  query?: TQuery;
  /** Highest-precedence headers for this call. */
  headers?: HeadersInitLike;
  signal?: AbortSignal;
  /** Overall budget for the call, including retries and backoff. */
  timeout?: number;
  retry?: number | RetryConfig | false;
  responseType?: ResponseType;
  meta?: Record<string, unknown>;
  /** When true, resolve to `ApiResponse<T>` instead of unwrapped `T`. */
  full?: boolean;
  /**
   * Explicit idempotency key for an operation configured with `idempotency`. Reuse the same key
   * when you retry the same logical write yourself.
   */
  idempotencyKey?: string;
};
