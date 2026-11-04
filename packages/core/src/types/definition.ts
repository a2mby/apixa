import type { AllBuiltinOpName, OperationFn } from "./builtins.js";
import type { OperationExtensions, ResourceExtensions } from "./extensions.js";
import type { HeadersInitLike, HttpMethod, QueryParams } from "./http.js";
import type { Middleware } from "./middleware.js";
import type { RetryConfig } from "./retry.js";
import type { Transport } from "./transport.js";

/**
 * A plain object keyed by the known builtin operation names (suggested for autocomplete/override)
 * plus any custom name, each mapped to `V`.
 */
export type OperationsBag<V> = Partial<Record<AllBuiltinOpName, V>> & Record<string, V>;

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

/**
 * Self-referential constraint for `defineApi<T>()`: every key of `T` must be a `ResourceState`.
 * Unlike `Record<string, ResourceState>`, this needs no index signature, so both
 * `type AppApi = {…}` and `interface AppApi {…}` satisfy it.
 */
export type ApiStateOf<T> = { [K in keyof T]: ResourceState };

/** Type-only keys on a resource state (not required at runtime). */
export type ResourceTypeOnlyKey = "entity" | "list" | "query" | "pagination";

/** Type-only keys on an operation state (not required at runtime). */
export type OperationTypeOnlyKey = "body" | "response" | "query";

export type OperationState =
  | (OperationDefinition & {
      body?: unknown;
      response?: unknown;
      query?: unknown;
    })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | ((...args: any[]) => Promise<any>)
  | boolean;

/**
 * Resource state: developer declares payload metadata; runtime config owns paths and selection.
 * `create` / `update` bodies are derived as `Omit<Entity,"id">` / `Partial<Entity>`.
 */
export type ResourceState = {
  /** Legacy metadata path, ignored in favor of the runtime path. */
  path?: string;
  headers?: HeadersInitLike;
  timeout?: number;
  retry?: RetryConfig | false;
  /** Entity for getById and create/update response typing. */
  entity?: unknown;
  /** Override getAll response type (default `Entity[]`). */
  list?: unknown;
  /** Default query type for getAll when op does not declare `query`. */
  query?: unknown;
  /**
   * Opt-in `getAll` envelope (v0.11.0) — type-only, same as `entity` / `list` / `query`. Absent by
   * default: zero behavior or type change unless declared. `"page"` types `getAll` as
   * `{ data, total, page, pageSize }` with a matching `page`/`pageSize` query; `"cursor"` types it
   * as `{ data, nextCursor }` with a `cursor`/`pageSize` query. Apixa does not parse or invent this
   * envelope — the backend already returns whatever shape it returns; this only shapes types.
   */
  pagination?: "page" | "cursor";
  /**
   * Sugar for `operations: { create: false, update: false, patch: false, upsert: false,
   * delete: false, createMany: false, deleteMany: false }`. An explicit `operations` entry for
   * any of those names still overrides this shorthand.
   */
  readOnly?: boolean;
  writeOnly?: boolean;
  defaultOperations?: boolean;
  /** Config object, function, or `false` (removes a builtin) — per key, suggested + custom names. */
  operations?: OperationsBag<OperationState>;
};

/** Runtime resource bag (value-only) + plugin seam. */
export type ResourceRuntimeInput = {
  path: string;
  headers?: HeadersInitLike;
  timeout?: number;
  retry?: RetryConfig | false;
  /** Sugar for removing the 7 write ops via `operations`; an explicit override still wins. */
  readOnly?: boolean;
  writeOnly?: boolean;
  defaultOperations?: boolean;
  operationGroups?: Partial<Record<"read" | "write" | "many" | "extended", boolean>>;
  operations?: OperationsBag<(OperationDefinition & OperationExtensions) | OperationFn | boolean>;
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
