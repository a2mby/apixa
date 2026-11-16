import { ConfigError, HttpError, NetworkError, TimeoutError } from "../errors/index.js";
import type { HttpMethod } from "../types/http.js";
import type {
  ResolvedRetryConfig,
  ResolvedTimeout,
  RetryHookContext,
  RetryOption,
  TimeoutOption,
} from "../types/retry.js";

/**
 * Idempotent by HTTP semantics. `POST` and `PATCH` are never retried unless the policy lists them:
 * a retried write that the server already processed would run twice.
 */
const DEFAULT_METHODS: HttpMethod[] = ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"];
export const READ_ONLY_RETRY_METHODS: HttpMethod[] = ["GET", "HEAD", "OPTIONS"];
const RETRY_KEYS = new Set([
  "count",
  "methods",
  "statusCodes",
  "backoff",
  "delay",
  "maxDelay",
  "jitter",
  "respectRetryAfter",
  "shouldRetry",
  "onRetry",
]);
/** Pre-v3 names, rejected with the replacement spelled out (never silently accepted). */
const RENAMED_RETRY_KEYS: Record<string, string> = {
  retries: "count",
  baseDelayMs: "delay",
  maxDelayMs: "maxDelay",
};

/** Validate + resolve once at client construction (or per call for a call-level override). */
export function resolveRetryConfig(
  value: RetryOption | undefined,
  label = "retry",
  defaultMethods: HttpMethod[] = DEFAULT_METHODS,
): ResolvedRetryConfig | undefined {
  if (value === undefined || value === false) return undefined;
  const config = typeof value === "number" ? { count: value } : value;
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new ConfigError(`${label} must be a number, a retry config object, or false.`);
  }
  for (const key of Object.keys(config)) {
    const renamed = RENAMED_RETRY_KEYS[key];
    if (renamed) throw new ConfigError(`${label}.${key} was renamed to \`${renamed}\`.`);
    if (!RETRY_KEYS.has(key)) throw new ConfigError(`${label} has unknown option "${key}".`);
  }
  if (typeof config.count !== "number" || !Number.isInteger(config.count) || config.count < 0) {
    throw new ConfigError(
      `${label}.count must be a non-negative integer (got ${String(config.count)}).`,
    );
  }
  for (const key of ["delay", "maxDelay"] as const) {
    const n = config[key];
    if (n !== undefined && (typeof n !== "number" || !Number.isFinite(n) || n < 0)) {
      throw new ConfigError(`${label}.${key} must be a non-negative number.`);
    }
  }
  if (
    config.backoff !== undefined &&
    config.backoff !== "exponential" &&
    config.backoff !== "linear"
  ) {
    throw new ConfigError(
      `${label}.backoff must be "exponential" or "linear" (got ${JSON.stringify(config.backoff)}).`,
    );
  }
  if (
    config.jitter !== undefined &&
    config.jitter !== false &&
    config.jitter !== "full" &&
    config.jitter !== "equal"
  ) {
    throw new ConfigError(
      `${label}.jitter must be "full", "equal" or false (got ${JSON.stringify(config.jitter)}).`,
    );
  }
  return {
    count: config.count,
    methods: config.methods ?? defaultMethods,
    statusCodes: config.statusCodes,
    backoff: config.backoff ?? "exponential",
    delay: config.delay ?? 200,
    maxDelay: config.maxDelay ?? 2000,
    jitter: config.jitter ?? "equal",
    respectRetryAfter: config.respectRetryAfter ?? true,
    shouldRetry: config.shouldRetry,
    onRetry: config.onRetry,
  };
}

const TIMEOUT_KEYS = new Set(["total", "perAttempt"]);

function assertBudget(label: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ConfigError(
      `${label} must be a non-negative number of milliseconds (got ${String(value)}).`,
    );
  }
}

/**
 * Validate + resolve a `timeout` option. A number is the total deadline; `0` disables that budget.
 * An object must state at least one of `total` / `perAttempt`.
 */
export function resolveTimeout(
  value: TimeoutOption | undefined,
  label = "timeout",
): ResolvedTimeout | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") {
    assertBudget(label, value);
    return { total: value };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigError(
      `${label} must be a non-negative number of milliseconds or { total?, perAttempt? } (got ${String(value)}).`,
    );
  }
  for (const key of Object.keys(value)) {
    if (!TIMEOUT_KEYS.has(key)) throw new ConfigError(`${label} has unknown option "${key}".`);
  }
  if (value.total === undefined && value.perAttempt === undefined) {
    throw new ConfigError(`${label} must set at least one of total or perAttempt.`);
  }
  if (value.total !== undefined) assertBudget(`${label}.total`, value.total);
  if (value.perAttempt !== undefined) assertBudget(`${label}.perAttempt`, value.perAttempt);
  return { total: value.total, perAttempt: value.perAttempt };
}

export function isRetryableStatus(status: number, statusCodes?: number[]): boolean {
  if (statusCodes) return statusCodes.includes(status);
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

/**
 * Default decision for transient failures: a network failure, a per-attempt timeout or a
 * retryable status. The total timeout and cancellation never reach here (the pipeline stops
 * first); non-transient errors (4xx, parse, validation, mock, config) are never retried.
 */
export function defaultShouldRetry(
  error: unknown,
  method: HttpMethod,
  retry: ResolvedRetryConfig,
  attempt: number,
): boolean {
  if (attempt >= retry.count || !retry.methods.includes(method)) return false;
  if (error instanceof NetworkError || error instanceof TimeoutError) return true;
  if (error instanceof HttpError) return isRetryableStatus(error.status ?? 0, retry.statusCodes);
  return false;
}

export function decideRetry(
  retry: ResolvedRetryConfig,
  ctx: RetryHookContext,
  error: unknown,
): boolean {
  if (ctx.attempt >= retry.count) return false;
  if (retry.shouldRetry) return retry.shouldRetry({ ...ctx, error });
  return defaultShouldRetry(error, ctx.method, retry, ctx.attempt);
}

/** Parse `Retry-After` (delta-seconds or HTTP date). Invalid values → `undefined`. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (header === null) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) {
    const ms = Number(trimmed) * 1000;
    return Number.isFinite(ms) ? ms : undefined;
  }
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

/**
 * Wait before the next attempt: `delay * 2^attempt` (exponential) or `delay * (attempt + 1)`
 * (linear), capped at `maxDelay`, then jittered. `random` is injectable for deterministic tests.
 */
export function computeBackoffMs(
  attempt: number,
  retry: Pick<ResolvedRetryConfig, "backoff" | "delay" | "maxDelay" | "jitter">,
  random: () => number = Math.random,
): number {
  const grown =
    retry.backoff === "linear" ? retry.delay * (attempt + 1) : retry.delay * 2 ** attempt;
  const capped = Math.min(grown, retry.maxDelay);
  if (retry.jitter === "full") return Math.floor(random() * capped);
  if (retry.jitter === "equal") return Math.floor(capped / 2 + random() * (capped / 2));
  return capped;
}

/** Resolves after `ms`, or rejects with the signal's reason as soon as it aborts (no leaked timers). */
export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
