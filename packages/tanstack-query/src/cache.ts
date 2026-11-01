import type { QueryClient } from "@tanstack/react-query";
import type { ResourceKeyFactory } from "./types.js";

function entityId(data: unknown): unknown | undefined {
  if (data && typeof data === "object" && "id" in data) {
    return (data as { id: unknown }).id;
  }
  return undefined;
}

/** D5 — invalidate lists; seed/patch detail when entity returned. */
export async function syncCacheAfterCreate(
  client: QueryClient,
  keys: ResourceKeyFactory,
  data: unknown,
): Promise<void> {
  const id = entityId(data);
  if (id !== undefined) {
    client.setQueryData(keys.detail(id), data);
  }
  await client.invalidateQueries({ queryKey: keys.lists() });
}

/** D5 — invalidate lists; seed detail when entity returned. */
export async function syncCacheAfterUpdate(
  client: QueryClient,
  keys: ResourceKeyFactory,
  data: unknown,
  variables: { id: unknown },
): Promise<void> {
  const id = entityId(data) ?? variables.id;
  if (data !== undefined && data !== null && id !== undefined) {
    client.setQueryData(keys.detail(id), data);
  } else if (id !== undefined) {
    await client.invalidateQueries({ queryKey: keys.detail(id) });
  }
  await client.invalidateQueries({ queryKey: keys.lists() });
}

/** D5 — invalidate lists; remove detail. */
export async function syncCacheAfterDelete(
  client: QueryClient,
  keys: ResourceKeyFactory,
  id: unknown,
): Promise<void> {
  await client.removeQueries({ queryKey: keys.detail(id) });
  await client.invalidateQueries({ queryKey: keys.lists() });
}
