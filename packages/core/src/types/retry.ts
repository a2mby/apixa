import type { HttpMethod } from "./http.js";
import type { ApiResponse, RequestConfig } from "./transport.js";

export type RetryHookContext = {
  request: RequestConfig;
  response?: ApiResponse<unknown>;
  error?: unknown;
  attempt: number;
  method: HttpMethod;
};

/**
 * Opt-in retry policy. When omitted or `false`, Core does not retry.
 * `retries` is the number of retries after the first attempt (total attempts = retries + 1).
 */
export type RetryConfig = {
  retries: number;
  /** Methods eligible for retry. Default: `GET`, `HEAD`. */
  methods?: HttpMethod[];
  /**
   * Exact status codes to retry. When omitted, Core retries `408`, `429`, and `500`–`599`.
   */
  statusCodes?: number[];
  /** Initial backoff delay in ms. Default: `200`. */
  baseDelayMs?: number;
  /** Cap for exponential backoff. Default: `2000`. */
  maxDelayMs?: number;
  /** Add random jitter to delay. Default: `true`. */
  jitter?: boolean;
  /** Honor `Retry-After` on HTTP responses when present. Default: `true`. */
  respectRetryAfter?: boolean;
  /** Override default retry decision. */
  shouldRetry?: (ctx: RetryHookContext) => boolean;
  /** Called before waiting for the next attempt. */
  onRetry?: (ctx: RetryHookContext) => void | Promise<void>;
};

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
