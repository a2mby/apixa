/** Hierarchical resource cache keys. Plain arrays only: no framework or query-library types. */
export type ResourceKeysInput = {
  queryKey: readonly unknown[];
  scope?: readonly unknown[];
};

export type ResourceKeys = {
  all: () => readonly unknown[];
  lists: () => readonly unknown[];
  list: (query?: unknown) => readonly unknown[];
  detail: (id: unknown) => readonly unknown[];
  operation: (op: string, parts?: readonly unknown[]) => readonly unknown[];
  infinites: () => readonly unknown[];
  infinite: (op?: string, parts?: readonly unknown[]) => readonly unknown[];
  mutation: (op: string) => readonly unknown[];
};

/**
 * Hierarchical keys:
 * `[...scope, ...queryKey]`
 * `[...scope, ...queryKey, "list", query?]`
 * `[...scope, ...queryKey, "detail", id]`
 * `[...scope, ...queryKey, "operation", op, ...args]`
 * `[...scope, ...queryKey, "infinite", op, ...keyParts]` (InfiniteData, never shared with lists)
 * `[...scope, ...queryKey, "mutation", op]`
 */
export function createResourceKeys(input: ResourceKeysInput): ResourceKeys {
  const root: readonly unknown[] = [...(input.scope ?? []), ...input.queryKey];

  return {
    all: () => root,
    lists: () => [...root, "list"],
    list: (query?: unknown) => (query === undefined ? [...root, "list"] : [...root, "list", query]),
    detail: (id: unknown) => [...root, "detail", id],
    operation: (op, parts = []) => [...root, "operation", op, ...parts],
    infinites: () => [...root, "infinite"],
    infinite: (op = "getAll", parts = []) => [...root, "infinite", op, ...parts],
    mutation: (op) => [...root, "mutation", op],
  };
}
