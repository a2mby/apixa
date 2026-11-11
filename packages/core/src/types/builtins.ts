import type { AdvancedTransferConfig, PresignedRequest } from "./advanced-transfer.js";
import type { RequestOptions } from "./transport.js";
import type { HeadersInitLike, HttpMethod, PathParams, QueryParams } from "./http.js";
import type { RetryOption } from "./retry.js";
import type { DataFormat } from "./definition.js";
import type {
  ApiResponse,
  BinaryResponseType,
  ResponseType,
  ResponseTypeData,
  TransferObserver,
} from "./transport.js";
import type { BuiltinConventionName } from "../operation/conventions.js";

/** The original 5 CRUD builtins. */
export type BuiltinOpName = Extract<
  BuiltinConventionName,
  "getAll" | "getById" | "create" | "update" | "delete"
>;

/** The 11 builtins beyond the original 5 (the `extended` group). */
export type ExtendedBuiltinOpName = Exclude<BuiltinConventionName, BuiltinOpName>;

/** All 16 builtins. */
export type AllBuiltinOpName = BuiltinOpName | ExtendedBuiltinOpName;

/** A request issued by a custom operation through `ctx.request()`. */
export interface OperationFnRequestInit {
  presigned?: PresignedRequest;
  method?: HttpMethod;
  /**
   * Path relative to the resource `path` (`"/:id/archive"`), `:name` filled from `params`. On a
   * mocked resource the request is simulated against its records or fails with
   * `MOCK_UNSUPPORTED` — it never reaches the network.
   */
  path?: string;
  params?: PathParams;
  query?: QueryParams;
  body?: unknown;
  /** Body encoding; default JSON, or multipart automatically when the body holds `File` / `Blob`. */
  dataFormat?: DataFormat;
  headers?: HeadersInitLike;
  timeout?: number;
  retry?: RetryOption;
  responseType?: ResponseType;
  /** Largest accepted response body in bytes for this request. */
  maxResponseSize?: number;
  /** Origins this request may be redirected to, credential-free (`GET` / `HEAD` only). */
  redirectOrigins?: readonly string[];
  /** Opt in to transfer lifecycle events for this request. */
  onTransfer?: TransferObserver;
  meta?: Record<string, unknown>;
  /** When true, resolve to `ApiResponse<T>` instead of unwrapped `T`. */
  full?: boolean;
  signal?: AbortSignal;
}

/**
 * First argument of a custom operation function. `ctx.request()` runs through the same
 * lifecycle as generated operations (headers, middleware, transforms, retry, errors, mocking).
 */
export interface OperationFnContext {
  transfer<T, F extends boolean = false>(
    config: AdvancedTransferConfig<T>,
    body: unknown,
    options?: RequestOptions & { full?: F },
  ): Promise<F extends true ? ApiResponse<T> : T>;
  /**
   * A literal non-JSON `responseType` types the result (`"blob"` → `Blob`, `"arrayBuffer"` →
   * `ArrayBuffer`, `"text"` → `string`, `"stream"` → `ReadableStream<Uint8Array> | null`), and
   * `full: true` wraps it in `ApiResponse`. Otherwise name the type yourself: `request<User>(…)`.
   */
  request<RT extends BinaryResponseType, F extends boolean = false>(
    init: OperationFnRequestInit & { responseType: RT; full?: F },
  ): Promise<F extends true ? ApiResponse<ResponseTypeData<RT>> : ResponseTypeData<RT>>;
  request<T = unknown>(init: OperationFnRequestInit): Promise<T>;
  /** `resources` key and operation name. */
  readonly resource: string;
  readonly operation: string;
}

/**
 * A fully custom operation: called exactly like a generated one — `api.resource.<name>(...)`.
 * The first parameter (`ctx`) is bound by Core; callers never pass it.
 */
export type OperationFn = {
  // Method syntax keeps parameters bivariant: unannotated args are `unknown` (never `any`),
  // while annotated ones like `(ctx, id: number) => …` remain assignable.
  bivariant(ctx: OperationFnContext, ...args: unknown[]): Promise<unknown>;
}["bivariant"];
