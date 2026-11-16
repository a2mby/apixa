import type { ApiRequest, ApiResponse } from "./transport.js";

/** Runs once per logical request, before transport. Return a request (or nothing to keep it). */
export type RequestMiddleware = (
  request: ApiRequest,
) => ApiRequest | void | Promise<ApiRequest | void>;

/**
 * Runs once, on the final successful logical response (never on an intermediate retried
 * response), after unwrapping, key transforms, parsing and builtin normalization. Return a
 * response (or nothing to keep it). The operation's `schema.response` and the builtin result
 * checks run **after** it, so a replaced payload is still validated.
 */
export type ResponseMiddleware = (
  response: ApiResponse<unknown>,
) => ApiResponse<unknown> | void | Promise<ApiResponse<unknown> | void>;

/** What an attempt hook sees: the logical request with this attempt's own headers. */
export interface AttemptContext {
  /**
   * The request of this transport attempt. `headers` is a fresh copy for every attempt, so a
   * token, signature, nonce or date set here never leaks into the next attempt. Only headers may
   * change: the method, URL and body are fixed by the logical request.
   */
  request: ApiRequest;
  /** Zero-based transport attempt, the same number transfer events and retry hooks report. */
  attempt: number;
}

/** Runs before every transport attempt (including retries). Mutate `context.request.headers`. */
export type AttemptMiddleware = (context: AttemptContext) => void | Promise<void>;

export interface AttemptResponseContext extends AttemptContext {
  /** The HTTP response this attempt received (any status). Its body is already decoded. */
  response: { status: number; headers: Headers; data: unknown };
  /**
   * Ask for one more attempt after this response, for example after refreshing an expired token
   * on a `401`. Granted at most once per logical call, never for a non-replayable body, and never
   * for a `POST` / `PATCH` that is neither listed in the retry policy nor sent with an
   * idempotency key. When it is not granted the response is handled as usual.
   */
  retry(): void;
}

/**
 * Runs after every transport attempt that received an HTTP response (not after a network
 * failure, which has no response). Use it to inspect intermediate statuses; the final successful
 * response still goes through `onResponse` exactly once.
 */
export type AttemptResponseMiddleware = (context: AttemptResponseContext) => void | Promise<void>;

/**
 * Runs once when the logical call ultimately fails (HTTP, network, timeout, abort, mock, config,
 * transform, …), never for an attempt that a retry recovered.
 * - throw → that error continues to the next handler (and is finally thrown to the caller);
 * - return a value other than `undefined` → the call recovers and resolves to that value;
 * - return `undefined` → not handled, the same error continues.
 *
 * `context.replay()` re-runs the whole call once (fresh headers, middleware and retries) inside
 * the **same** total timeout budget — e.g. refresh a token on 401, then `return context.replay()`.
 * It is `undefined` inside a replay, so a replay can never loop.
 */
export type ErrorMiddleware = (
  error: unknown,
  context: { request?: ApiRequest; replay?: () => Promise<unknown> },
) => unknown | Promise<unknown>;

/** Middleware hooks grouped by lifecycle stage: logical call hooks and transport attempt hooks. */
export interface MiddlewareHooks {
  /** Once per logical call. */
  onRequest?: readonly RequestMiddleware[];
  /** Before every transport attempt. */
  onAttempt?: readonly AttemptMiddleware[];
  /** After every transport attempt that received an HTTP response. */
  onAttemptResponse?: readonly AttemptResponseMiddleware[];
  /** Once, on the final successful response. */
  onResponse?: readonly ResponseMiddleware[];
  /** Once, on the terminal failure. */
  onError?: readonly ErrorMiddleware[];
}

/** Middleware runs root → resource → operation, and in array order within each hook list. */
export interface MiddlewareOptions {
  middleware?: MiddlewareHooks;
}
