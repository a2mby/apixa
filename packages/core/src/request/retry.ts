import { AbortError, HttpError, NetworkError, TimeoutError } from "../errors/index.js";
import type { HttpMethod } from "../types/http.js";
import type { ResolvedRetryConfig, RetryConfig, RetryHookContext } from "../types/retry.js";
import type { ApiResponse } from "../types/transport.js";

const DEFAULT_METHODS: HttpMethod[] = ["GET", "HEAD"];
const DEFAULT_BASE_DELAY_MS = 200;
const DEFAULT_MAX_DELAY_MS = 2000;

export function resolveRetryConfig(
  value: RetryConfig | false | undefined,
): ResolvedRetryConfig | undefined {
  if (value === undefined || value === false) {
    return undefined;
  }

  if (value.retries < 0 || !Number.isFinite(value.retries)) {
    throw new Error(`retry.retries must be a non-negative number (got ${String(value.retries)})`);
  }

  return {
    retries: Math.floor(value.retries),
    methods: value.methods ?? DEFAULT_METHODS,
    statusCodes: value.statusCodes,
    baseDelayMs: value.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    maxDelayMs: value.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
    jitter: value.jitter ?? true,
    respectRetryAfter: value.respectRetryAfter ?? true,
    shouldRetry: value.shouldRetry,
    onRetry: value.onRetry,
  };
}

export function isRetryableStatus(status: number, statusCodes?: number[]): boolean {
  if (statusCodes) {
    return statusCodes.includes(status);
  }
  if (status === 408 || status === 429) {
    return true;
  }
  return status >= 500 && status <= 599;
}

export function defaultShouldRetry(
  error: unknown,
  method: HttpMethod,
  retry: ResolvedRetryConfig,
  attempt: number,
): boolean {
  if (attempt >= retry.retries) {
    return false;
  }

  if (error instanceof AbortError) {
    return false;
  }

  if (!retry.methods.includes(method)) {
    return false;
  }

  if (error instanceof NetworkError || error instanceof TimeoutError) {
    return true;
  }

  if (error instanceof HttpError && error.status !== undefined) {
    return isRetryableStatus(error.status, retry.statusCodes);
  }

  return false;
}

export function decideRetry(
  retry: ResolvedRetryConfig,
  ctx: RetryHookContext,
  error: unknown,
): boolean {
  if (retry.shouldRetry) {
    return retry.shouldRetry({ ...ctx, error });
  }
  return defaultShouldRetry(error, ctx.method, retry, ctx.attempt);
}

export function computeRetryDelayMs(
  attempt: number,
  retry: ResolvedRetryConfig,
  response?: ApiResponse<unknown>,
): number {
  if (retry.respectRetryAfter && response) {
    const header = response.headers.get("retry-after");
    if (header) {
      const seconds = Number(header);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(seconds * 1000, retry.maxDelayMs);
      }
      const dateMs = Date.parse(header);
      if (!Number.isNaN(dateMs)) {
        return Math.min(Math.max(0, dateMs - Date.now()), retry.maxDelayMs);
      }
    }
  }

  const exp = retry.baseDelayMs * 2 ** attempt;
  const capped = Math.min(exp, retry.maxDelayMs);
  if (!retry.jitter) {
    return capped;
  }
  return Math.floor(Math.random() * (capped + 1));
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortRejection(signal));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortRejection(signal!));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function createAbortRejection(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof DOMException && reason.name === "TimeoutError") {
    return reason;
  }
  if (reason instanceof TimeoutError) {
    return reason;
  }
  if (reason instanceof Error && reason.name === "AbortError") {
    return reason;
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

/** @deprecated Use `defaultShouldRetry` / `decideRetry`. Kept for test imports. */
export const shouldRetry = defaultShouldRetry;
