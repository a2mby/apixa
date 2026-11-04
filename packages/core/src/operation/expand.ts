import type { OperationDefinition } from "../types/definition.js";
import type { OperationFn } from "../types/builtins.js";
import { COMPOSED_BUILTINS } from "./builtins.js";
import { CONVENTION_DEFAULTS, EXTENDED_CONVENTION_DEFAULTS } from "./conventions.js";

export type OperationInput = OperationDefinition | OperationFn | false;
export type ExpandedOperation = OperationDefinition | OperationFn;

export interface ExpandOperationsOptions {
  /**
   * Sugar for implicitly removing the 7 write-op names (`create`, `update`, `patch`, `upsert`,
   * `delete`, `bulkCreate`, `bulkDelete`) unless `operations` has its own explicit entry for one
   * — an explicit override (object, function, or `false`) for a write-op name still wins.
   */
  readOnly?: boolean;
}

const WRITE_OP_NAMES = new Set([
  "create",
  "update",
  "patch",
  "upsert",
  "delete",
  "bulkCreate",
  "bulkDelete",
]);

/**
 * Every builtin — the original 5 CRUD conventions plus the 10 added later (7 declarative, 3
 * composed over getAll/getById) — is always-on for a resource with `path`, same default-first
 * behavior as the original 5 since v0.2.0. `false` removes one; a developer's own object/function
 * at that name overrides the default; any other name is a fully custom operation.
 */
export function expandOperations(
  operations?: Record<string, OperationInput>,
  options?: ExpandOperationsOptions,
): Record<string, ExpandedOperation> {
  const expanded: Record<string, ExpandedOperation> = {};
  const readOnly = options?.readOnly === true;

  const isImplicitlyRemoved = (name: string) =>
    readOnly && WRITE_OP_NAMES.has(name) && !(operations && name in operations);

  for (const name of Object.keys(CONVENTION_DEFAULTS)) {
    if (isImplicitlyRemoved(name)) continue;
    const override = operations?.[name];
    if (override === false) continue;
    expanded[name] = typeof override === "function" ? override : { ...(override ?? {}) };
  }

  for (const name of Object.keys(EXTENDED_CONVENTION_DEFAULTS)) {
    if (isImplicitlyRemoved(name)) continue;
    const override = operations?.[name];
    if (override === false) continue;
    expanded[name] = typeof override === "function" ? override : { ...(override ?? {}) };
  }

  for (const name of Object.keys(COMPOSED_BUILTINS)) {
    const override = operations?.[name];
    if (override === false) continue;
    expanded[name] = typeof override === "function" ? override : COMPOSED_BUILTINS[name]!;
  }

  if (!operations) {
    return expanded;
  }

  for (const [name, definition] of Object.entries(operations)) {
    if (name in expanded) continue; // already handled above
    if (definition === false || definition === undefined) continue; // no-op removal of an inactive name

    expanded[name] = typeof definition === "function" ? definition : { ...definition };
  }

  return expanded;
}
