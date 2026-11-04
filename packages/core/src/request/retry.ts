import { ConfigError, HttpError, NetworkError } from "../errors/index.js";
import type { HttpMethod } from "../types/http.js";
import type { ResolvedRetryConfig, RetryHookContext, RetryOption } from "../types/retry.js";

const DEFAULT_METHODS: HttpMethod[] = ["GET", "HEAD", "OPTIONS"];
const RETRY_KEYS = new Set([
  "retries",
  "methods",
  "statusCodes",
  "baseDelayMs",
  "maxDelayMs",
  "jitter",
  "respectRetryAfter",
  "shouldRetry",
  "onRetry",
]);

/** Validate + resolve once at client construction (or per call for a call-level override). */
export function resolveRetryConfig(
  value: RetryOption | undefined,
  label = "retry",
): ResolvedRetryConfig | undefined {
  if (value === undefined || value === false) return undefined;
  const config = typeof value === "number" ? { retries: value } : value;
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new ConfigError(`${label} must be a number, a retry config object, or false.`);
  }
  for (const key of Object.keys(config)) {
    if (!RETRY_KEYS.has(key)) throw new ConfigError(`${label} has unknown option "${key}".`);
  }
  if (
    typeof config.retries !== "number" ||
    !Number.isInteger(config.retries) ||
    config.retries < 0
  ) {
    throw new ConfigError(
      `${label}.retries must be a non-negative integer (got ${String(config.retries)}).`,
    );
  }
  for (const key of ["baseDelayMs", "maxDelayMs"] as const) {
    const n = config[key];
    if (n !== undefined && (typeof n !== "number" || !Number.isFinite(n) || n < 0)) {
      throw new ConfigError(`${label}.${key} must be a non-negative number.`);
    }
  }
  return {
    retries: config.retries,
    methods: config.methods ?? DEFAULT_METHODS,
    statusCodes: config.statusCodes,
    baseDelayMs: config.baseDelayMs ?? 200,
    maxDelayMs: config.maxDelayMs ?? 2000,
    jitter: config.jitter ?? true,
    respectRetryAfter: config.respectRetryAfter ?? true,
    shouldRetry: config.shouldRetry,
    onRetry: config.onRetry,
  };
}

export function isRetryableStatus(status: number, statusCodes?: number[]): boolean {
  if (statusCodes) return statusCodes.includes(status);
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

/**
 * Default decision for transient failures. Timeout / abort never reach here (the pipeline
 * stops first); non-transient errors (4xx, parse, validation, mock, config) are never retried.
 */
export function defaultShouldRetry(
  error: unknown,
  method: HttpMethod,
  retry: ResolvedRetryConfig,
  attempt: number,
): boolean {
  if (attempt >= retry.retries || !retry.methods.includes(method)) return false;
  if (error instanceof NetworkError) return true;
  if (error instanceof HttpError) return isRetryableStatus(error.status ?? 0, retry.statusCodes);
  return false;
}

export function decideRetry(
  retry: ResolvedRetryConfig,
  ctx: RetryHookContext,
  error: unknown,
): boolean {
  if (ctx.attempt >= retry.retries) return false;
  if (retry.shouldRetry) return retry.shouldRetry({ ...ctx, error });
  return defaultShouldRetry(error, ctx.method, retry, ctx.attempt);
}

/** Parse `Retry-After` (delta-seconds or HTTP date). Invalid values → `undefined`. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (header === null) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

/** Exponential backoff with equal jitter: `cap/2 + random * cap/2`. */
export function computeBackoffMs(
  attempt: number,
  retry: ResolvedRetryConfig,
  random: () => number = Math.random,
): number {
  const capped = Math.min(retry.baseDelayMs * 2 ** attempt, retry.maxDelayMs);
  if (!retry.jitter) return capped;
  return Math.floor(capped / 2 + random() * (capped / 2));
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
