import type { RequestConfig } from "./transport.js";

export type MiddlewareNext = () => Promise<unknown>;

/**
 * Thin request interceptor. Runs once per logical call (wraps the full retry loop).
 * Mutate `ctx.request` (e.g. `ctx.request.headers.set(...)`) before calling `next()`.
 */
export type Middleware = (ctx: MiddlewareContext, next: MiddlewareNext) => Promise<unknown>;

export type MiddlewareContext = {
  request: RequestConfig;
};
