export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type PathParams = Record<string, string | number>;

export type QueryScalar = string | number | boolean | Date | null | undefined;
export type QueryValue =
  | QueryScalar
  | readonly QueryValue[]
  | { readonly [key: string]: QueryValue };

export type QueryParams = Record<string, QueryValue>;

/**
 * Common HTTP headers as optional string fields, plus an index signature for custom names.
 * Types only — Core does not inject these at runtime.
 */
export interface BuiltinHeaders {
  Accept?: string;
  Authorization?: string;
  "Content-Type"?: string;
  "Accept-Language"?: string;
  "Cache-Control"?: string;
  "If-None-Match"?: string;
  "If-Modified-Since"?: string;
  "X-Request-Id"?: string;
  "X-Api-Key"?: string;
  "X-Client"?: string;
  "X-Correlation-Id"?: string;
  "User-Agent"?: string;
  [header: string]: string | undefined;
}

/** Accepts Fetch `HeadersInit` or the typed `BuiltinHeaders` bag. */
export type HeadersInitLike = HeadersInit | BuiltinHeaders;

/**
 * Static headers, or a provider evaluated for every logical request (sync or async) so
 * refreshed credentials are always used.
 */
export type HeadersSource =
  HeadersInitLike | (() => HeadersInitLike | undefined | Promise<HeadersInitLike | undefined>);
