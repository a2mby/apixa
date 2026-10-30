import type { ApiResponse, RequestConfig } from "./transport.js";

export type MiddlewareNext = () => Promise<ApiResponse<unknown>>;

/**
 * Request interceptor. `next()` runs the remaining chain + one transport attempt
 * and may be called more than once (e.g. refresh token then retry).
 */
export type Middleware = (
  ctx: MiddlewareContext,
  next: MiddlewareNext,
) => Promise<ApiResponse<unknown>>;

export type MiddlewareContext = {
  request: RequestConfig;
  response?: ApiResponse<unknown>;
  attempt: number;
  meta: Record<string, unknown>;
};
