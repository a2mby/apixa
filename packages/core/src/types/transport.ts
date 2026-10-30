import type { HeadersInitLike, HttpMethod, PathParams, QueryParams } from "./http.js";
import type { RetryConfig } from "./retry.js";

export type ResponseType = "json" | "text" | "blob" | "arrayBuffer" | "stream";

export interface RequestConfig {
  method: HttpMethod;
  url: string;
  path: string;
  baseURL?: string;
  headers: Headers;
  params?: PathParams;
  query?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
  timeout?: number;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  raw: Response;
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

export type RequestOptions<TQuery = QueryParams> = {
  query?: TQuery;
  headers?: HeadersInitLike;
  signal?: AbortSignal;
  timeout?: number;
  retry?: RetryConfig | false;
  responseType?: ResponseType;
  meta?: Record<string, unknown>;
  /** When true, resolve to `ApiResponse<T>` instead of unwrapped `T`. */
  full?: boolean;
};
