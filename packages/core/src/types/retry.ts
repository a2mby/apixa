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

/** How the wait between attempts grows: `delay * 2^attempt` or `delay * (attempt + 1)`. */
export type RetryBackoff = "exponential" | "linear";

/**
 * Randomization of each wait. `"equal"` waits within `[delay/2, delay]`, `"full"` within
 * `[0, delay]`, `false` waits exactly `delay`.
 */
export type RetryJitter = "full" | "equal" | false;

/**
 * Opt-in retry policy (`retry: 2` is shorthand for `{ count: 2 }`). Omitted / `false` means no
 * retries. `count` is the number of **additional** transport attempts after the first one. Only
 * transport attempts are retried: logical middleware (`onRequest`, `onResponse`, `onError`) and
 * header providers run once per call, attempt hooks (`onAttempt`, `onAttemptResponse`) once per attempt.
 */
export type RetryConfig = {
  count: number;
  /**
   * Methods eligible for retry. Default: `GET`, `HEAD`, `OPTIONS`, `PUT`, `DELETE`. `POST` and
   * `PATCH` are never retried unless listed here.
   */
  methods?: HttpMethod[];
  /** Exact status codes to retry. Default: `408`, `429`, `500`–`599`. */
  statusCodes?: number[];
  /** Backoff growth. Default `"exponential"`. */
  backoff?: RetryBackoff;
  /** Initial wait in ms. Default `200`. */
  delay?: number;
  /** Cap of one wait in ms. Default `2000`. A `Retry-After` longer than this stops retrying. */
  maxDelay?: number;
  /** Randomize each wait. Default `"equal"`. */
  jitter?: RetryJitter;
  /** Honor a valid `Retry-After` header (seconds or HTTP date). Default `true`. */
  respectRetryAfter?: boolean;
  /** Override the retry decision (never consulted after the total timeout or cancellation). */
  shouldRetry?: (ctx: RetryHookContext) => boolean;
  /** Called before waiting for the next attempt. */
  onRetry?: (ctx: RetryHookContext) => void | Promise<void>;
};

export type RetryOption = number | RetryConfig | false;

/** Resolved retry policy with defaults applied. */
export type ResolvedRetryConfig = {
  count: number;
  methods: HttpMethod[];
  statusCodes?: number[];
  backoff: RetryBackoff;
  delay: number;
  maxDelay: number;
  jitter: RetryJitter;
  respectRetryAfter: boolean;
  shouldRetry?: (ctx: RetryHookContext) => boolean;
  onRetry?: (ctx: RetryHookContext) => void | Promise<void>;
};

/**
 * Time budget of one logical call. A number is the **total** deadline in ms (all attempts, waits
 * and hooks). The object form bounds the whole call (`total`), each transport attempt
 * (`perAttempt`), or both; a per-attempt expiry may be retried, a total expiry is terminal.
 */
export type TimeoutOption = number | { total?: number; perAttempt?: number };

/** Resolved timeout; an absent / `0` value means "no limit" for that budget. */
export type ResolvedTimeout = { total?: number; perAttempt?: number };
