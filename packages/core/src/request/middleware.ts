import type { ApiResponse } from "../types/transport.js";
import type { Middleware, MiddlewareContext, MiddlewareNext } from "../types/middleware.js";

/** Compose middleware left-to-right; each `next` may be called more than once. */
export function composeMiddleware(middleware: Middleware[]): Middleware {
  return async (ctx: MiddlewareContext, next: MiddlewareNext) => {
    const dispatch = (i: number): Promise<ApiResponse<unknown>> => {
      const fn = middleware[i];
      if (!fn) {
        return next();
      }
      return fn(ctx, () => dispatch(i + 1));
    };

    return dispatch(0);
  };
}
