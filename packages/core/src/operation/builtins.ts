import { isHttpError } from "../errors/index.js";
import { extractPathParamNames, joinPath } from "../http/path.js";
import { executeRequest } from "../request/execute.js";
import type {
  ResolvedApiConfig,
  ResolvedOperation,
  ResolvedResourceConfig,
} from "../types/definition.js";
import type { QueryParams } from "../types/http.js";
import { BUILTIN_CONVENTIONS, isBuiltinName } from "./conventions.js";

type Conventions = typeof BUILTIN_CONVENTIONS;
type StrategyName = {
  [K in keyof Conventions]: Conventions[K] extends { strategy: string } ? K : never;
}[keyof Conventions];

function toArray(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && Array.isArray((result as { data?: unknown }).data)) {
    return (result as { data: unknown[] }).data;
  }
  return [];
}

/** Each strategy executes its own resolved operation through Core's request pipeline. */
export function createBuiltinStrategy(
  name: StrategyName,
  api: ResolvedApiConfig,
  resource: ResolvedResourceConfig,
  operation: ResolvedOperation,
  resourcePath: string,
): (...args: unknown[]) => Promise<unknown> {
  if (operation.hasBody) {
    throw new Error(`Builtin "${name}" has no body mapping; hasBody: true is unsupported.`);
  }
  const resourceParamNames = extractPathParamNames(resourcePath);
  if (name === "exists") {
    const idParam = extractPathParamNames(operation.path).find(
      (param) => !resourceParamNames.includes(param),
    );
    return async (id: unknown, resourceParams?: unknown) => {
      try {
        await executeRequest(api, resource, operation, {
          params: {
            ...(resourceParams as Record<string, string | number> | undefined),
            ...(idParam ? { [idParam]: id as string | number } : {}),
          },
          query: idParam ? undefined : { id: id as string | number },
        });
        return true;
      } catch (error) {
        if (isHttpError(error) && error.status === 404) return false;
        throw error;
      }
    };
  }
  if (name === "findFirst") {
    return async (query?: unknown, params?: unknown) =>
      toArray(
        await executeRequest(api, resource, operation, {
          query: query as QueryParams | undefined,
          params: params as Record<string, string | number> | undefined,
        }),
      )[0] ?? null;
  }
  if (name === "getMany") {
    return async (ids: unknown, params?: unknown) =>
      toArray(
        await executeRequest(api, resource, operation, {
          query: { id: ids as Array<string | number> },
          params: params as Record<string, string | number> | undefined,
        }),
      );
  }
  return async (fieldOrPath: unknown, value: unknown, params?: unknown) => {
    const field = String(fieldOrPath);
    const encoded = encodeURIComponent(String(value));
    if (/:field\b|:value\b/.test(operation.path)) {
      const path = operation.path
        .replace(/:field\b/g, encodeURIComponent(field))
        .replace(/:value\b/g, encoded);
      return executeRequest(
        api,
        resource,
        { ...operation, path },
        {
          params: params as Record<string, string | number> | undefined,
        },
      );
    }
    const dynamic = /:[A-Za-z0-9_]+/.test(field)
      ? field.replace(/:[A-Za-z0-9_]+/, encoded)
      : joinPath(field, encoded);
    return executeRequest(
      api,
      resource,
      { ...operation, path: joinPath(operation.path, dynamic) },
      {
        params: params as Record<string, string | number> | undefined,
      },
    );
  };
}

export function isStrategyBuiltin(name: string): name is StrategyName {
  return isBuiltinName(name) && "strategy" in BUILTIN_CONVENTIONS[name];
}
