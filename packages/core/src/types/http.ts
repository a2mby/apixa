export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type PathParams = Record<string, string | number>;

export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined | Array<string | number | boolean>
>;

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
