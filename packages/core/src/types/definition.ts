import type { HeadersInitLike, HttpMethod } from "./http.js";
import type { Type } from "./marker.js";
import type { Transport } from "./transport.js";

/** Type marker object for an operation. Values are not read at runtime except `method`, `path`, `headers`, `timeout`, and the presence of `body`. */
export interface OperationDefinition {
  method?: HttpMethod;
  /** Path relative to the resource `path`. Convention names default when omitted. */
  path?: string;
  /** Type marker for the JSON request body (`type<Body>()`). */
  body?: Type<unknown>;
  /** Type marker for the unwrapped response payload (`type<User>()`). */
  response?: Type<unknown>;
  /** Type marker for query-string parameters. */
  query?: unknown;
  headers?: HeadersInitLike;
  timeout?: number;
}

export interface ResourceDefinition {
  path: string;
  /** Optional. When omitted, built-in CRUD operations are generated. When present, merges onto builtins. */
  operations?: Record<string, OperationDefinition>;
  headers?: HeadersInitLike;
  timeout?: number;
}

export type ReservedApiConfigKey = "baseURL" | "headers" | "transport" | "timeout";

export interface ApiRootConfig {
  baseURL: string;
  headers?: HeadersInitLike;
  transport?: Transport;
  timeout?: number;
}

export interface ResolvedApiConfig {
  baseURL: string;
  headers?: HeadersInitLike;
  transport: Transport;
  timeout?: number;
}

export interface ResolvedResourceConfig {
  headers?: HeadersInitLike;
  timeout?: number;
}

export interface ResolvedOperation {
  name: string;
  method: HttpMethod;
  path: string;
  hasBody: boolean;
  headers?: HeadersInitLike;
  timeout?: number;
}
