import type { AllBuiltinOpName, OperationFn } from "./builtins.js";
import type { HeadersSource, HttpMethod, QueryParams } from "./http.js";
import type { MiddlewareOptions } from "./middleware.js";
import type { MockDatasetId } from "./mock-datasets.js";
import type { RetryOption } from "./retry.js";
import type { TransformsConfig } from "./transform.js";
import type { Transport } from "./transport.js";

/**
 * A plain object keyed by the known builtin operation names (suggested for autocomplete/override)
 * plus any custom name, each mapped to `V`.
 */
export type OperationsBag<V> = Partial<Record<AllBuiltinOpName, V>> & Record<string, V>;

/** How array query values are encoded. Default: `"repeat"`. */
export type QueryArrayFormat = "repeat" | "comma" | "brackets";

/** Settings shared by root, resource, and operation levels (most specific wins). */
export interface LayerOptions extends MiddlewareOptions {
  headers?: HeadersSource;
  /** Overall budget per call in ms, including retries and backoff. */
  timeout?: number;
  retry?: RetryOption;
  transforms?: TransformsConfig;
}

/**
 * Runtime operation config: overrides merge with the builtin convention (unspecified fields keep
 * their defaults). Payload types live on the `defineApi<T>()` metadata, not here.
 */
/** Read/write classification. Builtins use their convention; custom operations declare it. */
export type OperationKind = "read" | "write";

/**
 * Opt-in idempotency key for a write. Apixa only sends the key; the backend must deduplicate.
 * `true` sends a generated UUID in `Idempotency-Key`.
 */
export type IdempotencyOption =
  | boolean
  | {
      /** Header name. Default `"Idempotency-Key"`. */
      header?: string;
      /** Key generator, called once per logical call. Default `crypto.randomUUID()`. */
      generate?: () => string;
    };

export interface OperationDefinition extends LayerOptions {
  method?: HttpMethod;
  /**
   * Writes only. One key per logical call, reused across Core retries and an error-middleware
   * replay. Pass `idempotencyKey` in the call options to supply (and reuse) your own key.
   */
  idempotency?: IdempotencyOption;
  /**
   * Custom operations only: `"read"` marks it safe to run as a cached query (integrations such as
   * `@apixa/tanstack-query`). Required for custom operations. Builtins keep their fixed convention.
   */
  kind?: OperationKind;
  /** Path relative to the resource `path`, or an absolute URL on the API origin. */
  path?: string;
  /** Override body presence. Default: `true` for POST / PUT / PATCH (and `deleteMany`). */
  hasBody?: boolean;
  /**
   * Custom operations only: what this operation does on a **mocked** resource, as
   * `(context: OperationMockContext) => result` (see `OperationMockHandler`). Typed from the
   * resource's mock records and the operation's path; `unknown` here so the typed overlay in
   * `defineApi` can give the handler its parameter types. Without a handler a custom operation on a
   * mocked resource rejects with `MOCK_UNSUPPORTED`; on a live resource the handler is ignored.
   */
  mock?: unknown;
}

/** A function operation with metadata — same execution as passing the function directly. */
export interface OperationRunDefinition {
  /** Required for custom operations. */
  kind?: OperationKind;
  run: OperationFn;
}

export type OperationValue = boolean | OperationDefinition | OperationFn | OperationRunDefinition;

/** Records for a mocked resource: inline, or loaded on first use. */
export type MockData =
  | MockDatasetId
  | readonly object[]
  /** Providers may return `unknown[]` (typed `unknown`); records are validated when loaded. */
  | (() => readonly unknown[] | Promise<readonly unknown[]>);

/** `mock` value: data source only — operation behavior always lives in `operations`. */
export type MockOption =
  | MockData
  | {
      data: MockData;
      /** Identity field. Default `"id"` (datasets use their catalog identity). */
      idKey?: string;
      /** How many initial records enter the store (not a cap — creates can grow it). */
      seed?: { limit?: number; offset?: number };
    };

export type OperationGroupName = "read" | "write" | "many" | "extended";

/** Runtime resource definition under `resources`. */
export interface ResourceDefinition extends LayerOptions {
  path: string;
  /** `false` starts with no builtins (enable some through `operations` / `operationGroups`). */
  defaultOperations?: boolean;
  /** Removes the 7 write builtins (explicit groups / operations still win). */
  readOnly?: boolean;
  /** Removes the 9 read builtins (explicit groups / operations still win). */
  writeOnly?: boolean;
  operationGroups?: Partial<Record<OperationGroupName, boolean>>;
  operations?: OperationsBag<OperationValue>;
  /** Data source for client-scoped Mocking. A mocked resource never touches the network. */
  mock?: MockOption;
  /**
   * List envelope contract shared by live and mocked resources. Live: describes what the
   * server returns (types only). Mocked: the engine produces this envelope.
   */
  pagination?: "page" | "cursor";
  /** Cap array `getAll` responses: first N rows or `{ start, end }`. Not mock seeding. */
  slice?: number | { start: number; end: number };
}

/** Root `defineApi` configuration. Resources live only under `resources`. */
export interface ApiRootConfig extends LayerOptions {
  baseURL: string;
  transport?: Transport;
  /** Array encoding for query strings. Default: `"repeat"`. */
  queryArrayFormat?: QueryArrayFormat;
  /** Replaces Core's query string builder entirely. */
  querySerializer?: (query: QueryParams) => string;
  resources: Record<string, ResourceDefinition>;
}

/** Developer metadata for `defineApi<T>()`: types only, keyed by resource name. */
export type ApiState = Record<string, ResourceState>;

/**
 * Self-referential constraint for `defineApi<T>()`: every key of `T` must be a `ResourceState`.
 * Works for both `type AppApi = {…}` and `interface AppApi {…}`.
 */
export type ApiStateOf<T> = { [K in keyof T]: ResourceState };

export type ResourceTypeOnlyKey = "entity" | "list" | "query";
export type OperationTypeOnlyKey = "body" | "response" | "query";

/** Payload metadata for one operation. */
export type OperationState = {
  body?: unknown;
  response?: unknown;
  query?: unknown;
};

/**
 * Resource metadata — types only. Runtime config owns paths, selection, and mocks; a key here
 * never creates a runtime resource or operation.
 */
export type ResourceState = {
  /** Entity for reads and write responses. */
  entity?: unknown;
  /** Override the `getAll` list type (default `Entity[]`). */
  list?: unknown;
  /** Default query type for list reads. */
  query?: unknown;
  /**
   * Payload types for operations that the runtime config actually defines (a function type is
   * accepted for custom operations; the runtime function's own signature still wins).
   */
  operations?: Record<string, OperationState | ((...args: never[]) => unknown)>;
};
