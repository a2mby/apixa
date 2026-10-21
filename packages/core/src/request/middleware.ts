import type { Middleware, MiddlewareContext, MiddlewareNext } from "../types/middleware.js";

/** Compose middleware left-to-right; the innermost `next` runs the request (+ retries). */
export function composeMiddleware(middleware: Middleware[]): Middleware {
  return async (ctx: MiddlewareContext, next: MiddlewareNext) => {
    let index = -1;

    const dispatch = async (i: number): Promise<unknown> => {
      if (i <= index) {
        throw new Error("middleware next() called multiple times");
      }
      index = i;
      const fn = middleware[i];
      if (!fn) {
        return next();
      }
      return fn(ctx, () => dispatch(i + 1));
    };

    return dispatch(0);
  };
}
