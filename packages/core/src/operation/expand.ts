import type {
  OperationDefinition,
  OperationRunDefinition,
  OperationSelection,
} from "../types/definition.js";
import type { OperationFn } from "../types/builtins.js";
import { BUILTIN_CONVENTIONS, isBuiltinName } from "./conventions.js";

export type OperationInput = OperationDefinition | OperationRunDefinition | OperationFn | boolean;
export type ExpandedOperation = OperationDefinition | OperationRunDefinition | OperationFn;
/**
 * Named overrides win over the selected preset or list, independent of property order.
 * Inputs are validated by `api/validate.ts` before this runs (once, at construction).
 */
export function expandOperations(
  operations?: Record<string, OperationInput> | OperationSelection,
): Record<string, ExpandedOperation> {
  let selection: OperationSelection | undefined;
  let overrides: Record<string, OperationInput> | undefined;
  if (typeof operations === "string" || Array.isArray(operations)) {
    selection = operations as OperationSelection;
  } else if (operations && Object.hasOwn(operations, "preset")) {
    const { preset, ...named } = operations as { preset: OperationSelection } & Record<
      string,
      OperationInput
    >;
    selection = preset;
    overrides = named;
  } else {
    overrides = operations as Record<string, OperationInput> | undefined;
  }
  const enabled = new Map<string, boolean>();
  for (const [name, convention] of Object.entries(BUILTIN_CONVENTIONS)) {
    const on = selection === undefined || (Array.isArray(selection)
      ? selection.includes(name as never)
      : selection === "all" ||
        (selection === "crud" && !convention.extended) ||
        (selection === "read" && convention.access === "read"));
    enabled.set(name, on);
  }

  const expanded: Record<string, ExpandedOperation> = {};
  for (const name of Object.keys(BUILTIN_CONVENTIONS)) {
    const override = overrides?.[name];
    if (override === false || (override === undefined && !enabled.get(name))) continue;
    expanded[name] =
      typeof override === "function"
        ? override
        : override === true || override === undefined
          ? {}
          : override;
  }
  for (const [name, definition] of Object.entries(overrides ?? {})) {
    if (
      isBuiltinName(name) ||
      definition === false ||
      definition === undefined ||
      definition === true
    )
      continue;
    expanded[name] = definition;
  }
  return expanded;
}
