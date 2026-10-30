import { joinPath } from "../http/path.js";
import type { OperationDefinition, ResolvedOperation } from "../types/definition.js";
import { CONVENTION_DEFAULTS } from "./conventions.js";

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

export function resolveOperation(
  name: string,
  resourcePath: string,
  definition: OperationDefinition,
): ResolvedOperation {
  const defaults = CONVENTION_DEFAULTS[name];
  const method = definition.method ?? defaults?.method;

  if (!method) {
    throw new Error(
      `Operation "${name}" is missing method. Convention names (getAll, getById, create, update, delete) supply a default; custom operations must set method.`,
    );
  }

  const relativePath = definition.path ?? defaults?.path ?? "";
  const hasBody = definition.hasBody ?? BODY_METHODS.has(method);

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
