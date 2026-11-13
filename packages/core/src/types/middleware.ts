import type { ApiRequest, ApiResponse } from "./transport.js";

/** Runs once per logical request, before transport. Return a request (or nothing to keep it). */
export type RequestMiddleware = (
  request: ApiRequest,
) => ApiRequest | void | Promise<ApiRequest | void>;

/** Runs after response key transforms. Return a response (or nothing to keep it). */
export type ResponseMiddleware = (
  response: ApiResponse<unknown>,
) => ApiResponse<unknown> | void | Promise<ApiResponse<unknown> | void>;

/**
 * Runs when the call fails (HTTP, network, timeout, abort, mock, config, transform, …).
 * - throw → that error continues to the next handler (and is finally thrown to the caller);
 * - return a value other than `undefined` → the call recovers and resolves to that value;
 * - return `undefined` → not handled, the same error continues.
 *
 * `context.replay()` re-runs the whole call once (fresh headers, middleware, retries, a new
 * timeout budget) — e.g. refresh a token on 401, then `return context.replay()`. It is
 * `undefined` inside a replay, so a replay can never loop.
 */
export type ErrorMiddleware = (
  error: unknown,
  context: { request?: ApiRequest; replay?: () => Promise<unknown> },
) => unknown | Promise<unknown>;

/** Middleware hooks grouped by lifecycle stage. */
export interface MiddlewareHooks {
  onRequest?: readonly RequestMiddleware[];
  onResponse?: readonly ResponseMiddleware[];
  onError?: readonly ErrorMiddleware[];
}

/** Middleware runs root → resource → operation, and in array order within each hook list. */
export interface MiddlewareOptions {
  middleware?: MiddlewareHooks;
}
