import type { BuiltinHeaders, HeadersInitLike, HttpMethod } from "./http.js";
import type { Middleware } from "./middleware.js";
import type { RetryConfig } from "./retry.js";
import type { Transport } from "./transport.js";

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
   * Whether the operation sends a JSON body. Builtin `create` / `update` default to true.
   * Set explicitly for custom body operations.
   */
  hasBody?: boolean;
}

export interface ResourceDefinition {
  path: string;
  /** Optional. When omitted, built-in CRUD operations are generated. When present, merges onto builtins. */
  operations?: Record<string, OperationDefinition>;
  headers?: HeadersInitLike;
  timeout?: number;
  /** Opt-in retry override for this resource (`false` disables inherited retry). */
  retry?: RetryConfig | false;
}

export type ReservedApiConfigKey =
  "baseURL" | "headers" | "transport" | "timeout" | "retry" | "middleware";

export interface ApiRootConfig {
  baseURL: string;
  headers?: BuiltinHeaders | HeadersInitLike;
  transport?: Transport;
  timeout?: number;
  /** Opt-in retries. Omitted / `false` means no retries. */
  retry?: RetryConfig | false;
  /**
   * Ordered interceptors. Each runs once per logical call and wraps the full retry loop.
   * Mutate `ctx.request` (e.g. headers) before `next()`.
   */
  middleware?: Middleware[];
}

/**
 * Developer state for `defineApi<T>()`: **resources only**.
 * Root builtins (`baseURL`, `headers`, `transport`, `timeout`, `retry`, `middleware`) come from Core on the runtime config.
 */
export type ApiState = Record<string, ResourceState | unknown>;

/** Type-only keys on a resource state (not required at runtime). */
export type ResourceTypeOnlyKey = "entity";

/** Type-only keys on an operation state (not required at runtime). */
export type OperationTypeOnlyKey = "body" | "response" | "query";

export type OperationState = OperationDefinition & {
  body?: unknown;
  response?: unknown;
  query?: unknown;
};

/**
 * Resource state: developer declares `path` + `entity`.
 * `create` / `update` bodies are derived as `Omit<Entity,"id">` / `Partial<Entity>`.
 */
export type ResourceState = {
  path: string;
  headers?: BuiltinHeaders | HeadersInitLike;
  timeout?: number;
  retry?: RetryConfig | false;
  /** Entity for getAll / getByID and create/update response typing. */
  entity?: unknown;
  operations?: Record<string, OperationState>;
};

export interface ResolvedApiConfig {
  baseURL: string;
  headers?: HeadersInitLike;
  transport: Transport;
  timeout?: number;
  retry?: RetryConfig | false;
  middleware?: Middleware[];
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
