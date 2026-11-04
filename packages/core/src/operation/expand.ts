import type { OperationDefinition } from "../types/definition.js";
import type { OperationFn } from "../types/builtins.js";
import { BUILTIN_CONVENTIONS, isBuiltinName } from "./conventions.js";

export type OperationInput = OperationDefinition | OperationFn | boolean;
export type ExpandedOperation = OperationDefinition | OperationFn;
export type OperationGroup = "read" | "write" | "extended" | "many";

export interface ExpandOperationsOptions {
  defaultOperations?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  operationGroups?: Partial<Record<OperationGroup, boolean>>;
}

/** Broad groups resolve before `many`; individual entries always resolve last. */
const GROUP_ORDER: readonly OperationGroup[] = ["extended", "read", "write", "many"];

export function expandOperations(
  operations?: Record<string, OperationInput>,
  options: ExpandOperationsOptions = {},
): Record<string, ExpandedOperation> {
  if (options.readOnly && options.writeOnly) {
    throw new Error("A resource cannot set both readOnly and writeOnly to true.");
  }

  const enabled = new Map<string, boolean>();
  for (const [name, convention] of Object.entries(BUILTIN_CONVENTIONS)) {
    enabled.set(name, options.defaultOperations !== false);
    if (options.readOnly && convention.access === "write") enabled.set(name, false);
    if (options.writeOnly && convention.access === "read") enabled.set(name, false);
  }

  for (const group of GROUP_ORDER) {
    const choice = options.operationGroups?.[group];
    if (choice === undefined) continue;
    if (typeof choice !== "boolean") throw new Error(`operationGroups.${group} must be boolean.`);
    for (const [name, convention] of Object.entries(BUILTIN_CONVENTIONS)) {
      if (
        (group === "extended" && convention.extended) ||
        (group === "many" && convention.many) ||
        group === convention.access
      ) {
        enabled.set(name, choice);
      }
    }
  }
  for (const group of Object.keys(options.operationGroups ?? {})) {
    if (!GROUP_ORDER.includes(group as OperationGroup)) {
      throw new Error(`Unknown operation group "${group}".`);
    }
  }

  const expanded: Record<string, ExpandedOperation> = {};
  for (const name of Object.keys(BUILTIN_CONVENTIONS)) {
    const override = operations?.[name];
    if (override === false || (override === undefined && !enabled.get(name))) continue;
    expanded[name] =
      typeof override === "function" ? override : override === true ? {} : { ...(override ?? {}) };
  }

  for (const [name, definition] of Object.entries(operations ?? {})) {
    if (isBuiltinName(name) || definition === false || definition === undefined) continue;
    if (definition === true) {
      throw new Error(
        `Custom operation "${name}" needs a method/path configuration or function; true cannot create it.`,
      );
    }
    expanded[name] = definition;
  }
  return expanded;
}
