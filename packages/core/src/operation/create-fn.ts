import { extractPathParamNames, joinPath } from "../http/path.js";
import { executeRequest } from "../request/execute.js";
import type {
  ResolvedApiConfig,
  ResolvedOperation,
  ResolvedResourceConfig,
} from "../types/definition.js";
import type { OperationFn, OperationFnContext, OperationFnRequestInit } from "../types/builtins.js";
import { parseOperationArgs } from "./args.js";

/**
 * Wrap a custom operation function: bind a `ctx.request()` helper to the resource so the
 * function still runs through Core's normal pipeline (headers, retry, middleware, errors)
 * instead of reimplementing it.
 */
export function createFunctionOperationFn(
  api: ResolvedApiConfig,
  resource: ResolvedResourceConfig,
  resourcePath: string,
  fn: OperationFn,
) {
  const ctx: OperationFnContext = {
    request: async <T = unknown>(init: OperationFnRequestInit): Promise<T> => {
      const operation: ResolvedOperation = {
        name: "<custom>",
        method: init.method ?? "GET",
        path: joinPath(resourcePath, init.path ?? ""),
        hasBody: init.body !== undefined,
      };

      const result = await executeRequest(api, resource, operation, {
        params: init.params,
        query: init.query,
        body: init.body,
        headers: init.headers,
        signal: init.signal,
        timeout: init.timeout,
        retry: init.retry,
        responseType: init.responseType,
        meta: init.meta,
        full: init.full,
      });
      return result as T;
    },
  };

  return (...args: unknown[]) => fn(ctx, ...args);
}

export function createOperationFn(
  api: ResolvedApiConfig,
  resource: ResolvedResourceConfig,
  operation: ResolvedOperation,
) {
  const pathParamNames = extractPathParamNames(operation.path);

  return (...args: unknown[]) => {
    const parsed = parseOperationArgs(pathParamNames, operation.hasBody, args);
    const options = parsed.options;

    return executeRequest(api, resource, operation, {
      params: parsed.params,
      query: options?.query,
      body: parsed.body,
      headers: options?.headers,
      signal: options?.signal,
      timeout: options?.timeout,
      retry: options?.retry,
      responseType: options?.responseType,
      meta: options?.meta,
      full: options?.full,
    });
  };
}
