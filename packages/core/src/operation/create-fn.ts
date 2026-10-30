import { extractPathParamNames } from "../http/path.js";
import { executeRequest } from "../request/execute.js";
import type {
  ResolvedApiConfig,
  ResolvedOperation,
  ResolvedResourceConfig,
} from "../types/definition.js";
import { parseOperationArgs } from "./args.js";

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
