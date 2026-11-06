import { BUILTIN_CONVENTIONS, getOperationMetadata } from "@apixa/core";

/** How the integration treats one operation. Derived from Core metadata, never from names/verbs. */
export type OperationInfo = {
  kind: "read" | "write";
  builtin: boolean;
  /** Position of Core's trailing `RequestOptions` argument; `null` when Core doesn't own it. */
  optionsIndex: number | null;
  /** Core sends an idempotency key for this operation (`idempotency` configured). */
  idempotency: boolean;
};

/** Plain resources use Core's canonical builtin table for their documented fallback. */
export const BUILTIN_READ_NAMES: ReadonlySet<string> = new Set(
  Object.entries(BUILTIN_CONVENTIONS)
    .filter(([, convention]) => convention.access === "read")
    .map(([name]) => name),
);

const cache = new WeakMap<object, ReadonlyMap<string, OperationInfo>>();

/**
 * Operation table of a resource client. Apixa clients carry Core metadata (exact `kind` and
 * options position). Plain objects (tests, hand-written clients) classify builtin read names while leaving argument positions unknown; every other function is a
 * write with no options binding.
 */
export function describeOperations(resource: object): ReadonlyMap<string, OperationInfo> {
  const cached = cache.get(resource);
  if (cached) return cached;
  const metadata = getOperationMetadata(resource);
  const table = new Map<string, OperationInfo>();
  for (const name of Object.keys(resource)) {
    if (typeof (resource as Record<string, unknown>)[name] !== "function") continue;
    const meta = metadata?.[name];
    table.set(
      name,
      meta
        ? {
            kind: meta.kind,
            builtin: meta.builtin,
            optionsIndex: meta.optionsIndex,
            idempotency: meta.idempotency === true,
          }
        : metadata
          ? { kind: "write", builtin: false, optionsIndex: null, idempotency: false }
          : Object.prototype.hasOwnProperty.call(BUILTIN_CONVENTIONS, name)
            ? {
                kind: BUILTIN_CONVENTIONS[name as keyof typeof BUILTIN_CONVENTIONS].access,
                builtin: true,
                optionsIndex: null,
                idempotency: false,
              }
            : { kind: "write", builtin: false, optionsIndex: null, idempotency: false },
    );
  }
  cache.set(resource, table);
  return table;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Throw if the Core `RequestOptions` slot asks for `full: true` (raw `ApiResponse` breaks typing). */
export function assertNoFullResponse(args: readonly unknown[], info: OperationInfo): void {
  if (info.optionsIndex === null) return;
  const options = args[info.optionsIndex];
  if (isPlainObject(options) && options.full === true) {
    throw new Error(
      "Apixa TanStack hooks return raw payloads; full: true needs the Core client directly.",
    );
  }
}
