import type { BuiltinHeaders, HeadersInitLike, HttpMethod } from "./http.js";
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
}

export type ReservedApiConfigKey = "baseURL" | "headers" | "transport" | "timeout";

export interface ApiRootConfig {
  baseURL: string;
  headers?: BuiltinHeaders | HeadersInitLike;
  transport?: Transport;
  timeout?: number;
}

/**
 * Developer state for `defineApi<T>()`: **resources only**.
 * Root builtins (`baseURL`, `headers`, `transport`, `timeout`) come from Core on the runtime config.
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
  /** Entity for getAll / getByID and create/update response typing. */
  entity?: unknown;
  operations?: Record<string, OperationState>;
};

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
