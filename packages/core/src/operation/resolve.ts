import { joinPath } from "../http/path.js";
import type { OperationDefinition, ResolvedOperation } from "../types/definition.js";
import { BUILTIN_CONVENTIONS, isBuiltinName } from "./conventions.js";

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

export function resolveOperation(
  name: string,
  resourcePath: string,
  definition: OperationDefinition,
): ResolvedOperation {
  const defaults = isBuiltinName(name) ? BUILTIN_CONVENTIONS[name] : undefined;
  const method = definition.method ?? defaults?.method;
  if (!method)
    throw new Error(`Operation "${name}" is missing method. Custom operations must set method.`);

  const relativePath = definition.path ?? defaults?.path ?? "";
  const hasBody =
    definition.hasBody ??
    (defaults && "strategy" in defaults ? false : undefined) ??
    (defaults && "hasBody" in defaults ? defaults.hasBody : undefined) ??
    BODY_METHODS.has(method);
  return {
    name,
    method,
    path: joinPath(resourcePath, relativePath),
    hasBody,
    headers: definition.headers,
    timeout: definition.timeout,
    retry: definition.retry,
  };
}
