import type { OperationKind } from "../types/definition.js";

/**
 * Non-enumerable key under which every resource client exposes per-operation metadata. A
 * registered symbol, so integrations resolve the same key even across duplicated bundles.
 */
export const OPERATION_METADATA: unique symbol = Symbol.for("apixa.operations");

/** Metadata Core records for one generated operation. Informational: it never changes execution. */
export interface OperationMetadata<Kind extends OperationKind = OperationKind> {
  /** Builtins: their convention. Custom: required `kind` from the definition. */
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
  /** True when the operation sends an idempotency key (`idempotency` configured). */
  readonly idempotency: boolean;
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

/** Per-client key generators of operations configured with `idempotency` (generators only, never keys). */
const IDEMPOTENCY_GENERATORS = new WeakMap<object, Readonly<Record<string, () => string>>>();

/** @internal Called once per resource client at construction. */
export function registerIdempotencyGenerators(
  resource: object,
  generators: Readonly<Record<string, () => string>>,
): void {
  IDEMPOTENCY_GENERATORS.set(resource, generators);
}

/**
 * A fresh idempotency key from the operation's own generator, or `undefined` when the operation
 * has no `idempotency` option. Integrations that retry a whole call (for example TanStack
 * mutations) create the key once and pass it as `options.idempotencyKey` on every attempt.
 */
export function createIdempotencyKey(resource: object, operation: string): string | undefined {
  return IDEMPOTENCY_GENERATORS.get(resource)?.[operation]?.();
}
