import type { QueryClient } from "@tanstack/react-query";
import type { ResourceKeyFactory } from "./types.js";

/** Explicitly map a response to a complete entity and its cache identity. */
export type CompleteEntityMapping<T> = (
  response: T,
) => { id: unknown; entity: unknown } | undefined;

/** Invalidate lists. A caller may explicitly map a complete entity to seed its detail. */
export async function syncCacheAfterCreate<T>(
  client: QueryClient,
  keys: ResourceKeyFactory,
  data: T,
  mapEntity?: CompleteEntityMapping<T>,
): Promise<void> {
  const mapped = mapEntity?.(data);
  if (mapped && mapped.id != null) client.setQueryData(keys.detail(mapped.id), mapped.entity);
  await client.invalidateQueries({ queryKey: keys.lists() });
}

/** Invalidate detail and lists unless the caller explicitly supplies a complete entity. */
export async function syncCacheAfterUpdate<T>(
  client: QueryClient,
  keys: ResourceKeyFactory,
  data: T,
  variables: { id: unknown },
  mapEntity?: CompleteEntityMapping<T>,
): Promise<void> {
  const mapped = mapEntity?.(data);
  if (mapped && mapped.id != null) {
    client.setQueryData(keys.detail(mapped.id), mapped.entity);
    if (variables.id != null && variables.id !== mapped.id) {
      await client.invalidateQueries({ queryKey: keys.detail(variables.id) });
    }
  } else if (variables.id != null) {
    await client.invalidateQueries({ queryKey: keys.detail(variables.id) });
  }
  await client.invalidateQueries({ queryKey: keys.lists() });
}

/** Remove the deleted detail and invalidate lists. */
export async function syncCacheAfterDelete(
  client: QueryClient,
  keys: ResourceKeyFactory,
  id: unknown,
): Promise<void> {
  await client.removeQueries({ queryKey: keys.detail(id) });
  await client.invalidateQueries({ queryKey: keys.lists() });
}
