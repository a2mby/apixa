import type { OperationExtensions, ResourceExtensions } from "./extensions.js";
import type { HeadersInitLike, HttpMethod, QueryParams } from "./http.js";
import type { Middleware } from "./middleware.js";
import type { RetryConfig } from "./retry.js";
import type { Transport } from "./transport.js";

/** How array query values are encoded. Default: `"repeat"`. */
export type QueryArrayFormat = "repeat" | "comma" | "brackets";

/**
 * Runtime operation config. Payload types live on the `defineApi<T>` state generic,
 * not as runtime marker values.
 */
export interface OperationDefinition {
  method?: HttpMethod;
  /** Path relative to the resource `path`. Convention names default when omitted. */
  path?: string;
  headers?: HeadersInitLike;
  timeout?: number;
  /** Opt-in retry override for this operation (`false` disables inherited retry). */
  retry?: RetryConfig | false;
  /**
   * Override body presence. Default: `true` for POST / PUT / PATCH, else `false`.
   */
  hasBody?: boolean;
}

export type ReservedApiConfigKey =
  | "baseURL"
  | "headers"
  | "transport"
  | "timeout"
  | "retry"
  | "middleware"
  | "queryArrayFormat"
  | "querySerializer";

export interface ApiRootConfig {
  baseURL: string;
  headers?: HeadersInitLike;
  transport?: Transport;
  timeout?: number;
  /** Opt-in retries. Omitted / `false` means no retries. */
  retry?: RetryConfig | false;
  /**
   * Ordered interceptors. `next()` returns `ApiResponse` and may be called more than once.
   */
  middleware?: Middleware[];
  /** Array encoding for query strings. Default: `"repeat"`. */
  queryArrayFormat?: QueryArrayFormat;
  /** When set, replaces Core’s query string builder entirely. */
  querySerializer?: (query: QueryParams) => string;
}

/**
 * Developer state for `defineApi<T>()`: **resources only**.
 * Root builtins come from Core on the runtime config.
 */
export type ApiState = Record<string, ResourceState>;

/** Type-only keys on a resource state (not required at runtime). */
export type ResourceTypeOnlyKey = "entity" | "list" | "query";

/** Type-only keys on an operation state (not required at runtime). */
export type OperationTypeOnlyKey = "body" | "response" | "query";

export type OperationState = OperationDefinition & {
  body?: unknown;
  response?: unknown;
  query?: unknown;
};

/**
 * Resource state: developer declares `path` + `entity` (and optional `list` / `query`).
 * `create` / `update` bodies are derived as `Omit<Entity,"id">` / `Partial<Entity>`.
 */
export type ResourceState = {
  path: string;
  headers?: HeadersInitLike;
  timeout?: number;
  retry?: RetryConfig | false;
  /** Entity for getById and create/update response typing. */
  entity?: unknown;
  /** Override getAll response type (default `Entity[]`). */
  list?: unknown;
  /** Default query type for getAll when op does not declare `query`. */
  query?: unknown;
  operations?: Record<string, OperationState>;
};

/** Runtime resource bag (value-only) + plugin seam. */
export type ResourceRuntimeInput = {
  path: string;
  headers?: HeadersInitLike;
  timeout?: number;
  retry?: RetryConfig | false;
  operations?: Record<string, OperationDefinition & OperationExtensions>;
} & ResourceExtensions;

export interface ResolvedApiConfig {
  baseURL: string;
  headers?: HeadersInitLike;
  transport: Transport;
  timeout?: number;
  retry?: RetryConfig | false;
  middleware?: Middleware[];
  queryArrayFormat?: QueryArrayFormat;
  querySerializer?: (query: QueryParams) => string;
}

export interface ResolvedResourceConfig {
  headers?: HeadersInitLike;
  timeout?: number;
  retry?: RetryConfig | false;
}

export interface ResolvedOperation {
  name: string;
  method: HttpMethod;
  path: string;
  hasBody: boolean;
  headers?: HeadersInitLike;
  timeout?: number;
  retry?: RetryConfig | false;
}
