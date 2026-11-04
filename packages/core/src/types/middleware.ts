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
 */
export type ErrorMiddleware = (
  error: unknown,
  context: { request?: ApiRequest },
) => unknown | Promise<unknown>;

/** General middleware: any of the three stages in one object. */
export interface MiddlewareHooks {
  onRequest?: RequestMiddleware;
  onResponse?: ResponseMiddleware;
  onError?: ErrorMiddleware;
}

/**
 * Middleware options accepted at root, resource, and operation level. All three styles feed
 * one pipeline. Order per stage: root → resource → operation; within a level `middleware`
 * runs before the `requestMiddleware` / `responseMiddleware` arrays (in array order).
 */
export interface MiddlewareOptions {
  middleware?: MiddlewareHooks;
  requestMiddleware?: RequestMiddleware[];
  responseMiddleware?: ResponseMiddleware[];
}
