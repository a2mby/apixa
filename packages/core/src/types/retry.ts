import type { HttpMethod } from "./http.js";
import type { ApiRequest, ApiResponse } from "./transport.js";

export type RetryHookContext = {
  request: ApiRequest;
  response?: ApiResponse<unknown>;
  error?: unknown;
  /** Zero-based attempt that just failed. */
  attempt: number;
  method: HttpMethod;
};

/**
 * Opt-in retry policy (`retry: 2` is shorthand for `{ retries: 2 }`). Omitted / `false` means no
 * retries. `retries` counts retries after the first attempt. Only HTTP transport attempts are
 * retried; middleware and header providers run once per logical call.
 */
export type RetryConfig = {
  retries: number;
  /** Methods eligible for retry. Default: `GET`, `HEAD`, `OPTIONS`. Writes need explicit opt-in. */
  methods?: HttpMethod[];
  /** Exact status codes to retry. Default: `408`, `429`, `500`–`599`. */
  statusCodes?: number[];
  /** Initial backoff in ms. Default `200`; doubles each attempt. */
  baseDelayMs?: number;
  /** Backoff cap in ms. Default `2000`. A `Retry-After` longer than this stops retrying. */
  maxDelayMs?: number;
  /** Randomize each backoff within [delay/2, delay]. Default `true`. */
  jitter?: boolean;
  /** Honor a valid `Retry-After` header (seconds or HTTP date). Default `true`. */
  respectRetryAfter?: boolean;
  /** Override the retry decision (never consulted after timeout or cancellation). */
  shouldRetry?: (ctx: RetryHookContext) => boolean;
  /** Called before waiting for the next attempt. */
  onRetry?: (ctx: RetryHookContext) => void | Promise<void>;
};

export type RetryOption = number | RetryConfig | false;

/** Resolved retry policy with defaults applied. */
export type ResolvedRetryConfig = {
  retries: number;
  methods: HttpMethod[];
  statusCodes?: number[];
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
  respectRetryAfter: boolean;
  shouldRetry?: (ctx: RetryHookContext) => boolean;
  onRetry?: (ctx: RetryHookContext) => void | Promise<void>;
};
