import type { HeadersInitLike, HttpMethod, PathParams, QueryParams } from "./http.js";
import type { RetryConfig } from "./retry.js";
import type { ResponseType } from "./transport.js";
import type { BuiltinConventionName } from "../operation/conventions.js";

/** The 5 conventions every path-only resource gets by default (unchanged since v0.2.0). */
export type BuiltinOpName = Extract<
  BuiltinConventionName,
  "getAll" | "getById" | "create" | "update" | "delete"
>;

/** Added in v0.10.0 — always-on for a resource with `path`, same as the original 5 (default-first). */
export type ExtendedBuiltinOpName = Exclude<BuiltinConventionName, BuiltinOpName>;

export type AllBuiltinOpName = BuiltinOpName | ExtendedBuiltinOpName;

/** Request a custom operation function may issue through Core's normal pipeline. */
export interface OperationFnRequestInit {
  method?: HttpMethod;
  /** Path relative to the resource `path`. `:name` segments are filled from `params`. */
  path?: string;
  params?: PathParams;
  query?: QueryParams;
  body?: unknown;
  headers?: HeadersInitLike;
  timeout?: number;
  retry?: RetryConfig | false;
  responseType?: ResponseType;
  meta?: Record<string, unknown>;
  /** When true, resolve to `ApiResponse<T>` instead of unwrapped `T`. */
  full?: boolean;
  signal?: AbortSignal;
}

/**
 * What a custom operation function receives as its first argument — a way to run a request
 * through the same headers/retry/middleware/error pipeline as every generated operation, without
 * reimplementing it.
 */
export interface OperationFnContext {
  request<T = unknown>(init: OperationFnRequestInit): Promise<T>;
}

/**
 * A fully custom operation: called exactly like a generated one — `api.resource.<name>(...)`.
 * The first parameter (`ctx`) is bound by Core; callers never pass it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OperationFn = (ctx: OperationFnContext, ...args: any[]) => Promise<unknown>;

export function isOperationFn(value: unknown): value is OperationFn {
  return typeof value === "function";
}
