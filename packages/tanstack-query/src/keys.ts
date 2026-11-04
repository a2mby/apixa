import type { QueryKey } from "@tanstack/react-query";
import type { ResourceKeyFactory } from "./types.js";

export type CreateResourceKeysInput = {
  queryKey: QueryKey;
  scope?: QueryKey;
};

/**
 * Hierarchical keys:
 * `[...scope, ...queryKey]`
 * `[...scope, ...queryKey, "list", query?]`
 * `[...scope, ...queryKey, "detail", id]`
 * `[...scope, ...queryKey, "mutation", op]`
 */
export function createResourceKeys(input: CreateResourceKeysInput): ResourceKeyFactory {
  const root: QueryKey = [...(input.scope ?? []), ...input.queryKey];

  return {
    all: () => root,
    lists: () => [...root, "list"],
    list: (query?: unknown) => (query === undefined ? [...root, "list"] : [...root, "list", query]),
    detail: (id: unknown) => [...root, "detail", id],
    operation: (op, parts = []) => [...root, "operation", op, ...parts],
    mutation: (op) => [...root, "mutation", op],
  };
}
