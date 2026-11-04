import type { OperationKind } from "../types/definition.js";

/**
 * Non-enumerable key under which every resource client exposes per-operation metadata. A
 * registered symbol, so integrations resolve the same key even across duplicated bundles.
 */
export const OPERATION_METADATA: unique symbol = Symbol.for("apixa.operations");

/** Metadata Core records for one generated operation. Informational: it never changes execution. */
export interface OperationMetadata<Kind extends OperationKind = OperationKind> {
  /** Builtins: their convention. Custom: `kind` from the definition, default `"write"`. */
  readonly kind: Kind;
  /** True when the name is one of the 16 builtins (whether generated or overridden). */
  readonly builtin: boolean;
  /** `"function"` for a function / `{ run }` operation, otherwise `"request"`. */
  readonly implementation: "request" | "function";
  /**
   * Zero-based position of the trailing `RequestOptions` argument, or `null` when Core does not
   * own the signature (function operations).
   */
  readonly optionsIndex: number | null;
}

/** Read the metadata of a resource client (`undefined` for objects not built by `defineApi`). */
export function getOperationMetadata(
  resource: object,
): Readonly<Record<string, OperationMetadata>> | undefined {
  const value = (resource as { [OPERATION_METADATA]?: unknown })[OPERATION_METADATA];
  return value && typeof value === "object"
    ? (value as Readonly<Record<string, OperationMetadata>>)
    : undefined;
}
