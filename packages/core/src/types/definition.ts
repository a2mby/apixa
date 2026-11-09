import type { AllBuiltinOpName, OperationFn } from "./builtins.js";
import type { HeadersSource, HttpMethod, QueryParams } from "./http.js";
import type { MiddlewareOptions } from "./middleware.js";
import type { MockDatasetId } from "./mock-datasets.js";
import type { RetryOption } from "./retry.js";
import type { ResponseType, TransferObserver } from "./transport.js";
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

/**
 * How a plain-object / array body is encoded. Default: JSON, or multipart automatically when the
 * body contains `File` / `Blob` values. `"json"` with binary values throws `SerializationError`.
 * A caller-built `FormData` / `Blob` / string body is always sent as is.
 */
export type DataFormat = "json" | "multipart";

/**
 * Opt-in client-side rules for the files of one field. They give fast, local feedback and avoid
 * wasted uploads; they are **not** security: `File.type` and `File.name` are chosen by whoever built
 * the `File`, extensions do not prove content, and the backend must validate everything again.
 * Only metadata (`size`, `type`, `name`) is read, never file bytes.
 */
export interface FileRules {
  /** Smallest allowed size in bytes per file (`1` refuses empty files). */
  minSize?: number;
  /** Largest allowed size in bytes per file. */
  maxSize?: number;
  /** Fewest files of this field. Checked only when the field is present (not `undefined`/`null`). */
  min?: number;
  /** Most files of this field. */
  max?: number;
  /**
   * Allow-list, like an `<input accept>`: MIME types (`"application/pdf"`), wildcards (`"image/*"`)
   * and extensions (`".png"`, `".tar.gz"`). A file passes when any entry matches the declared type
   * or the extension. Case-insensitive; MIME parameters are ignored.
   */
  accept?: readonly string[];
  /** Deny-list in the same syntax; wins over `accept`. */
  reject?: readonly string[];
  /**
   * A file with no declared type. Default: `"reject"` when `accept` is set (an allow-list refuses
   * what it cannot identify), otherwise nothing to decide.
   */
  unknownType?: "allow" | "reject";
  /** A file name without an extension. Default `"allow"`. */
  noExtension?: "allow" | "reject";
  /** `"strict"` flags unsafe names: separators, control characters, reserved or overlong names, hidden double extensions. */
  filename?: "strict";
}

/** Request-level limits across all files (and raw bodies) of one call. */
export interface FileLimits {
  /** Sum of all file sizes (and of a raw `Blob` / buffer / stream body) in bytes. */
  maxTotalSize?: number;
  /** Total number of files in the request. */
  maxFiles?: number;
  /** Size of a raw `Blob`, buffer, string or `ReadableStream` body that is not a file field. */
  maxBodySize?: number;
}

/** Options of one file field (advanced `fileFields` form). */
export interface FileFieldOptions extends FileRules {
  /** Wire part name, used verbatim (bypasses request key transforms). Default: the field name. */
  name?: string;
}

/**
 * Entity fields that hold files: names only, or names with options. Names are checked against the
 * resource entity; a file field's read type stays `string` / `string[]`.
 */
export type FileFieldsConfig = readonly string[] | Record<string, FileFieldOptions>;

/** Multipart encoding overrides (resource level, overridable per operation). */
export interface MultipartOptions {
  /** Top-level body fields sent as a single JSON-encoded part instead of bracket notation. */
  jsonFields?: readonly string[];
  /** `null` values: `"empty"` (default) sends an empty-string part, `"omit"` drops the field. */
  nulls?: "empty" | "omit";
  /**
   * Arrays of scalars: `"brackets"` (default, `key[]`), `"indices"` (`key[0]`) or `"repeat"` (`key`).
   * Arrays of files always repeat the field name; arrays of objects always use indices.
   */
  arrays?: "brackets" | "indices" | "repeat";
}

export interface OperationDefinition extends LayerOptions {
  method?: HttpMethod;
  /**
   * How this operation's response body is read: `"blob"`, `"arrayBuffer"`, `"text"`, `"stream"` or
   * the default `"json"`. A literal value types the result (`Blob`, `ArrayBuffer`, `string`,
   * `ReadableStream<Uint8Array> | null`) unless `defineApi<T>()` metadata declares a `response`.
   * A per-call `responseType` option wins over this one.
   */
  responseType?: ResponseType;
  /** Default transfer observer for this operation; a per-call `onTransfer` option wins. */
  onTransfer?: TransferObserver;
  /** Writes only. Body encoding for this operation; see {@link DataFormat}. */
  dataFormat?: DataFormat;
  /** Multipart encoding overrides for this operation (merged over the resource's). */
  multipart?: MultipartOptions;
  /**
   * File rule overrides for fields the resource declares in `fileFields` (merged key-wise over the
   * resource's rules; a defined value, including `0`, wins).
   */
  fileFields?: Record<string, FileRules>;
  /** Request-level file limits for this operation (merged key-wise over the resource's). */
  fileLimits?: FileLimits;
  /**
   * Largest accepted response body in bytes. Rejected early from a trustworthy `Content-Length`
   * and otherwise counted while reading (nothing is buffered beyond the limit). A per-call
   * `maxResponseSize` wins. A failed (non-2xx) response keeps its `HttpError`; an oversized error body is dropped (`data: null`).
   */
  maxResponseSize?: number;
  /**
   * Accepted response `Content-Type`s (MIME patterns like `"application/pdf"` / `"image/*"`). The
   * header is declared by the server and is not proof of content.
   */
  responseAccept?: readonly string[];
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
  /** Entity fields that hold files: typed `File | Blob` inputs on eligible writes. */
  fileFields?: FileFieldsConfig;
  /** Multipart encoding overrides for every operation of this resource. */
  multipart?: MultipartOptions;
  /** Request-level file limits for every operation of this resource (operations override key-wise). */
  fileLimits?: FileLimits;
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
