import type { AdvancedTransferConfig, PresignedPolicy } from "./advanced-transfer.js";
import type { MockStorageOptions } from "../mock/files.js";
import type { MockFileFixtures } from "../mock/fixtures.js";
import type { AllBuiltinOpName, OperationFn } from "./builtins.js";
import type { HeadersSource, HttpMethod, QueryParams } from "./http.js";
import type { MiddlewareOptions } from "./middleware.js";
import type { MockDatasetId } from "./mock-datasets.js";
import type { RetryOption, TimeoutOption } from "./retry.js";
import type { ResponseType, TransferObserver, ApiRequest } from "./transport.js";
import type { TransformsConfig } from "./transform.js";
import type { Transport } from "./transport.js";
import type { OperationSchema } from "./standard-schema.js";

/**
 * A plain object keyed by the known builtin operation names (suggested for autocomplete/override)
 * plus any custom name, each mapped to `V`.
 */
export type OperationsBag<V> = Partial<Record<AllBuiltinOpName, V>> & Record<string, V>;

/** How array query values are encoded. Default: `"repeat"`. */
export type QueryArrayFormat = "repeat" | "comma" | "brackets";

/** Client-wide query string serialization options. */
export interface QueryOptions {
  /**
   * How `null` query values are serialized. Default: `"omit"`.
   * - `"omit"`: omit keys and array items whose value is `null`
   * - `"empty"`: serialize as an empty value (`key=`)
   * - `"null"`: serialize as literal `"null"` (`key=null`)
   */
  nulls?: "omit" | "empty" | "null";
  /**
   * How empty array query values (`[]`) are serialized. Default: `"omit"`.
   * - `"omit"`: omit empty arrays
   * - `"empty"`: serialize as an empty value (`key=`, or `key%5B%5D=` in `"brackets"` mode)
   */
  emptyArrays?: "omit" | "empty";
  /**
   * How boolean query values are serialized. Default: `"string"` (`"true"` / `"false"`).
   * `"number"` encodes booleans as `"1"` / `"0"`.
   */
  booleans?: "string" | "number";
}

/** Context passed to `response.unwrap`, `response.parse`, and `response.validate` hooks. */
export interface ResponseHookContext {
  readonly status: number;
  readonly headers: Headers;
  readonly request: ApiRequest;
  readonly resource: string;
  readonly operation: string;
}

/** Response envelope extraction, parsing, and validation hooks (inherited root → resource → operation). */
export interface ResponseOptions<T = unknown> {
  /**
   * Extract payload from a backend response envelope (e.g. `"data"`, `"meta.item"`, or
   * `(source, ctx) => unknown`). Pass `false` to disable an inherited unwrap rule.
   */
  unwrap?: string | false | ((source: unknown, ctx: ResponseHookContext) => unknown);
  /**
   * Parse / coerce the unwrapped & key-transformed body before builtin normalization, response
   * middleware and `schema.response`. Non-`ApiError` throws are wrapped in `ValidationError`.
   * Pass `false` to disable an inherited parser.
   */
  parse?: ((data: unknown, ctx: ResponseHookContext) => T) | false;
  /**
   * Validate the processed response data. Returning a defined value replaces the data; returning
   * `undefined` keeps it unchanged. Non-`ApiError` throws are wrapped in `ValidationError`.
   * Pass `false` to disable an inherited validator.
   */
  validate?: { bivariant(data: unknown, ctx: ResponseHookContext): unknown }["bivariant"] | false;
}

/** Settings shared by root, resource, and operation levels (most specific wins). */
export interface LayerOptions extends MiddlewareOptions {
  headers?: HeadersSource;
  /**
   * Time budget per call. A number is the total deadline in ms (attempts, waits and hooks);
   * `{ total?, perAttempt? }` also bounds each transport attempt. Most specific layer wins.
   */
  timeout?: TimeoutOption;
  retry?: RetryOption;
  transforms?: TransformsConfig;
  response?: ResponseOptions;
}

/** Read/write classification. Declarative HTTP operations derive it from their method. */
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

/**
 * `S` is the type of the `schema` option. Core uses {@link OperationSchema} (Standard Schema V1
 * validators only); `apixa/validation` widens it to also accept plain-object shapes.
 */
export interface OperationDefinition<S = OperationSchema> extends LayerOptions {
  transfer?: AdvancedTransferConfig;
  presigned?: PresignedPolicy;
  method?: HttpMethod;
  /**
   * How this operation's response body is read: `"blob"`, `"arrayBuffer"`, `"text"`, `"stream"` or
   * the default `"json"`. A literal value types the result (`Blob`, `ArrayBuffer`, `string`,
   * `ReadableStream<Uint8Array> | null`) unless the operation declares a `schema.response`.
   * Fixed by the operation: a call cannot override it.
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
   * and otherwise counted while reading (nothing is buffered beyond the limit). This is
   * the operation's ceiling: a per-call `maxResponseSize` may only lower it. A failed (non-2xx) response keeps its `HttpError`; an oversized error body is dropped (`data: null`).
   */
  maxResponseSize?: number;
  /**
   * Exact origins a redirect of this operation may lead to (for example a CDN), followed without
   * request headers, cookies, credentials or body and only for `GET` / `HEAD`. Every other
   * cross-origin redirect fails with `SecurityError`; same-origin redirects keep working
   * (not in browsers, which hide redirect destinations, so every redirect is refused there).
   * Trusted operation policy: neither a call nor middleware can replace or widen it, and a custom
   * transport must declare `capabilities.redirectOrigins`.
   */
  redirectOrigins?: readonly string[];
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
  /** Explicit classification for function-based operations; HTTP methods determine their kind. */
  kind?: OperationKind;
  /** Path relative to the resource `path`, or an absolute URL on the API origin. */
  path?: string;
  /** Override body presence. Default: `true` for POST / PUT / PATCH / DELETE (and `deleteMany`), `false` for GET / HEAD / OPTIONS (and builtin `delete`). */
  hasBody?: boolean;
  /**
   * Custom operations only: what this operation does on a **mocked** resource, as
   * `(context: OperationMockContext) => result` (see `OperationMockHandler`). Typed from the
   * resource's mock records and the operation's path; `unknown` here so the typed overlay in
   * `defineApi` can give the handler its parameter types. Without a handler a custom operation on a
   * mocked resource rejects with `MOCK_UNSUPPORTED`; on a live resource the handler is ignored.
   */
  mock?: unknown;
  /**
   * Opt-in pagination for list operations (`getAll`, `getMany`, and custom declarative operations).
   * `true` uses the resource `paginationConfig` (or the standard `"page"` contract without one);
   * `false` disables it (including on `getAll`); a strategy name, preset or object **replaces** the
   * resource configuration completely (nothing is merged).
   */
  pagination?: ResourcePagination;
  /**
   * Standard Schema V1 validators for this operation: `{ body?, query?, response? }` (explicit
   * object only). `body` / `query` types come from the schema input and `response` from its output.
   * `schema.response` validates the final payload, after `response.parse` and `onResponse`
   * middleware; `emptyResponse` declares an intentionally empty body. Not available on `run` operations.
   */
  schema?: S;
}

/** A function operation with metadata — same execution as passing the function directly. */
export interface OperationRunDefinition {
  presigned?: PresignedPolicy;
  /** Required for custom operations. */
  kind?: OperationKind;
  run: OperationFn;
}

export type OperationValue<S = OperationSchema> =
  boolean | OperationDefinition<S> | OperationFn | OperationRunDefinition;

/** Builtin operation sets supported by the unified operation selector. */
export type OperationPreset = "crud" | "read" | "all";
export type OperationSelection<S = OperationSchema> =
  | OperationPreset
  | readonly AllBuiltinOpName[]
  | (OperationsBag<OperationValue<S> | OperationPreset | readonly AllBuiltinOpName[]> & {
      preset: OperationPreset | readonly AllBuiltinOpName[];
    });

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
      storage?: MockStorageOptions;
      fixtures?: MockFileFixtures;
      /** Identity field. Default `"id"` (datasets use their catalog identity). */
      idKey?: string;
      /** How many initial records enter the store (not a cap — creates can grow it). */
      seed?: { limit?: number; offset?: number };
    };

/** Runtime resource definition under `resources`. */
export interface ResourceDefinition<S = OperationSchema> extends LayerOptions {
  path: string;
  /** Entity identity field. Default: `"id"`. */
  idKey?: string;
  operations?: OperationsBag<OperationValue<S>> | OperationSelection<S>;
  /** Entity fields that hold files: typed `File | Blob` inputs on eligible writes. */
  fileFields?: FileFieldsConfig;
  /** Multipart encoding overrides for every operation of this resource. */
  multipart?: MultipartOptions;
  /** Request-level file limits for every operation of this resource (operations override key-wise). */
  fileLimits?: FileLimits;
  /** Data source for client-scoped Mocking. A mocked resource never touches the network. */
  mock?: MockOption;
  /**
   * Shared pagination configuration for this resource (recommended). Built-in `getAll` paginates
   * automatically when this is set; every other operation opts in with its own `pagination`
   * (`true` reuses this configuration). It never activates pagination on a custom operation by itself.
   * Mocked: the engine produces the contract. Live: the string form expects the server to already
   * return it; an object maps the server's own shape (`preset`, `fields`/`params`, or `parseList`).
   */
  paginationConfig?: ResourcePagination;
  /** Cap array `getAll` responses: first N rows or `{ start, end }`. Not mock seeding. */
  slice?: number | { start: number; end: number };
}

/** Root `defineApi` configuration. Resources live only under `resources`. */
export interface ApiRootConfig<S = OperationSchema> extends LayerOptions {
  baseURL: string;
  transport?: Transport;
  /** Array encoding for query strings. Default: `"repeat"`. */
  queryArrayFormat?: QueryArrayFormat;
  /** Client-wide query string serialization options (`nulls`, `emptyArrays`, `booleans`). */
  query?: QueryOptions;
  /** Replaces Core's query string builder entirely. */
  querySerializer?: (query: QueryParams) => string;
  resources: Record<string, ResourceDefinition<S>>;
}

/**
 * Developer metadata for `defineApi<T>()`: a map of resource name to its entity type, types only
 * (`interface ApiState { products: Product }`). Operation contracts come from each operation's
 * runtime `schema`, never from this map. Runtime config owns paths, selection and mocks.
 */
export type ApiState = Record<string, unknown>;

/** Keys of the removed pre-ADR-006 `ResourceState` wrapper. */
type LegacyStateKey = "entity" | "list" | "query" | "operations";

/**
 * A recognizable old wrapper: every key is a removed `ResourceState` key and it declares `entity`
 * or `operations`. A domain entity that merely has a property named `entity` has other keys too and
 * is never flagged.
 */
type IsLegacyWrapper<E> = [E] extends [object]
  ? [keyof E] extends [never]
    ? false
    : [Exclude<keyof E, LegacyStateKey>] extends [never]
      ? [Extract<keyof E, "entity" | "operations">] extends [never]
        ? false
        : true
      : false
  : false;

type LegacyStateError<K> = {
  readonly "apixa config error": `ApiState.${K & string} uses the removed { entity, list, query, operations } wrapper. Declare the entity itself (${K & string}: Product) and move operation types into each operation's \`schema\` (see docs/decisions/006).`;
};

/**
 * Self-referential constraint for `defineApi<T>()`: each key of `T` is that resource's entity
 * type. Works for both `type AppApi = {…}` and `interface AppApi {…}`; the old
 * `{ entity, operations }` wrapper is rejected with a migration message.
 */
export type ApiStateOf<T> = {
  [K in keyof T]: IsLegacyWrapper<T[K]> extends true ? LegacyStateError<K> : unknown;
};

/** Response field paths (dot notation) a live backend uses for apixa's pagination contract. */
export interface PaginationFields {
  data?: string;
  total?: string;
  page?: string;
  pageSize?: string;
  /** Total number of pages (optional metadata). */
  pageCount?: string;
  /** Whether the backend reports another page / more rows (optional metadata). */
  hasMore?: string;
  offset?: string;
  nextOffset?: string;
  previousOffset?: string;
  nextCursor?: string;
  previousCursor?: string;
}

/**
 * Backend query names for apixa's logical `page` / `pageSize` / `cursor` / `before` / `offset`.
 * `before` (continue backwards from a cursor) is only sent when mapped here.
 */
export interface PaginationParams {
  page?: string;
  pageSize?: string;
  cursor?: string;
  before?: string;
  offset?: string;
}

/** Logical pagination values (strategy-neutral), as handed to `buildRequest`. */
export interface LogicalPaginationInput {
  page?: number;
  pageSize?: number;
  cursor?: string;
  before?: string;
  offset?: number;
}

/** What `buildRequest` may add to the live request. Bodies must be plain objects. */
export interface PaginationRequestParts {
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/** Context given to `parseList` (response adapter): everything needed to decode unusual protocols. */
export interface PaginationResponseContext {
  status: number;
  /** Response headers. Browsers expose cross-origin headers only if the server sends `Access-Control-Expose-Headers`. */
  headers: Headers;
  request: {
    method: string;
    params?: Record<string, string | number>;
    /** The structured query the request was sent with (wire names). */
    query?: Record<string, unknown>;
    /** The logical pagination input that was resolved for this call (after defaults). */
    pagination: LogicalPaginationInput;
  };
}

/** Pagination strategies. */
export type PaginationStrategy = "page" | "cursor" | "offset";

/** Built-in backend mappings for `pagination.preset`. */
export type PaginationPreset = "laravel" | "laravel-paginator" | "strapi" | "payload" | "nestjs";

/** Declared pagination: boolean, strategy, preset shorthand, or mapping object. */
export type ResourcePagination =
  | boolean
  | PaginationStrategy
  | PaginationPreset
  | {
      strategy?: PaginationStrategy;
      /**
       * Named backend mapping; mutually exclusive with `fields`. `"laravel"` (resource collection),
       * `"laravel-paginator"` (`paginate()` / `cursorPaginate()`; page or cursor), `"strapi"`,
       * `"payload"` and `"nestjs"` (nestjs-typeorm-paginate) map page mode. When `preset` is set
       * without `strategy`, `"page"` is inferred.
       */
      preset?: PaginationPreset;
      fields?: PaginationFields;
      params?: PaginationParams;
      /** Backend page numbering for `page` (0 or 1). Logical pages stay one-based. Default 1. */
      pageBase?: 0 | 1;
      /** Sent when the caller supplies no page size (explicit, never guessed). */
      defaultPageSize?: number;
      /** Reject (never clamp) a requested page size above this. */
      maxPageSize?: number;
      /**
       * Response adapter for shapes `fields` cannot describe; wins over `preset` / `fields`. Returns
       * logical (one-based page) values using the contract field names.
       */
      parseList?: (body: any, ctx: PaginationResponseContext) => unknown;
      /**
       * Request adapter (live only): receives the validated logical input and decides placement in
       * query, body or headers. Replaces `params` (use one or the other).
       */
      buildRequest?: (
        input: LogicalPaginationInput,
        ctx: { method: string; query: Record<string, unknown>; body: unknown },
      ) => PaginationRequestParts;
    };

/** Page strategy result. `total` is required for `"page"`, presets and `true`; optional for custom objects. */
export type PageResult<T = unknown> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  pageCount?: number;
  hasMore?: boolean;
};
/** `PageResult` for custom mappings that may not report a total. */
export type OpenPageResult<T = unknown> = Omit<PageResult<T>, "total"> & { total?: number };
/** Cursor strategy result. Cursors are opaque; `nextCursor: null` means the backend reports the end. */
export type CursorResult<T = unknown> = {
  data: T[];
  nextCursor: string | null;
  previousCursor?: string | null;
  hasMore?: boolean;
};
/** Offset strategy result. */
export type OffsetResult<T = unknown> = {
  data: T[];
  offset: number;
  pageSize: number;
  total: number;
  nextOffset?: number | null;
  previousOffset?: number | null;
  hasMore?: boolean;
};
/** `OffsetResult` for custom mappings that may omit total / pageSize. */
export type OpenOffsetResult<T = unknown> = Omit<OffsetResult<T>, "total" | "pageSize"> & {
  total?: number;
  pageSize?: number;
};
/** Any normalized paginated result. */
export type PaginatedResult<T = unknown> =
  PageResult<T> | OpenPageResult<T> | CursorResult<T> | OffsetResult<T> | OpenOffsetResult<T>;

type PageShape<T> = PageResult<T>;
type CursorShape<T> = CursorResult<T>;

/**
 * What `getAll` resolves to for a resource using that preset, for typing component state:
 * `useState<LaravelPagination<Product> | null>(null)`. Every preset normalizes to the same page
 * contract (`Page<T>` in page mode, `CursorPage<T>` in cursor mode); the name records which backend
 * the state comes from.
 */
export type LaravelPagination<T> = PageShape<T>;
/** `preset: "laravel-paginator"` with `strategy: "page"` (`paginate()`). */
export type LaravelPaginatorPagination<T> = PageShape<T>;
/** `preset: "laravel-paginator"` with `strategy: "cursor"` (`cursorPaginate()`). */
export type LaravelCursorPagination<T> = CursorShape<T>;
/** `preset: "strapi"`. */
export type StrapiPagination<T> = PageShape<T>;
/** `preset: "payload"`. */
export type PayloadPagination<T> = PageShape<T>;
/** `preset: "nestjs"` (nestjs-typeorm-paginate). */
export type NestjsPagination<T> = PageShape<T>;
