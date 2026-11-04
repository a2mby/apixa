import type { OperationDefinition, OperationGroupName } from "../types/definition.js";
import type { OperationFn } from "../types/builtins.js";
import { BUILTIN_CONVENTIONS, isBuiltinName } from "./conventions.js";

export type OperationInput = OperationDefinition | OperationFn | boolean;
export type ExpandedOperation = OperationDefinition | OperationFn;
export type OperationGroup = OperationGroupName;

export interface ExpandOperationsOptions {
  defaultOperations?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  operationGroups?: Partial<Record<OperationGroup, boolean>>;
}

/**
 * Deterministic precedence (lowest → highest), independent of property order:
 * builtin defaults → `defaultOperations` → `readOnly`/`writeOnly` → `extended` → `read`/`write`
 * → `many` → individual `operations` entries. The type-level `Selected` mirrors this exactly.
 * Inputs are validated by `api/validate.ts` before this runs (once, at construction).
 */
const GROUP_ORDER: readonly OperationGroup[] = ["extended", "read", "write", "many"];

export function expandOperations(
  operations?: Record<string, OperationInput>,
  options: ExpandOperationsOptions = {},
): Record<string, ExpandedOperation> {
  const enabled = new Map<string, boolean>();
  for (const [name, convention] of Object.entries(BUILTIN_CONVENTIONS)) {
    let on = options.defaultOperations !== false;
    if (options.readOnly && convention.access === "write") on = false;
    if (options.writeOnly && convention.access === "read") on = false;
    for (const group of GROUP_ORDER) {
      const choice = options.operationGroups?.[group];
      if (choice === undefined) continue;
      if ((group === "extended" && convention.extended) || (group === "many" && convention.many) || group === convention.access) {
        on = choice;
      }
    }
    enabled.set(name, on);
  }

  const expanded: Record<string, ExpandedOperation> = {};
  for (const name of Object.keys(BUILTIN_CONVENTIONS)) {
    const override = operations?.[name];
    if (override === false || (override === undefined && !enabled.get(name))) continue;
    expanded[name] = typeof override === "function" ? override : override === true || override === undefined ? {} : override;
  }
  for (const [name, definition] of Object.entries(operations ?? {})) {
    if (isBuiltinName(name) || definition === false || definition === undefined || definition === true) continue;
    expanded[name] = definition;
  }
  return expanded;
}
