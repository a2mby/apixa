/**
 * Build a flat result without reading the native result eagerly.
 *
 * TanStack returns a tracking Proxy: every property read subscribes the component to changes of
 * that property. Spreading it would read (and track) every field. Instead each native field
 * becomes a lazy getter, so only fields the component actually reads are tracked — the same
 * re-render behavior as calling `useQuery` directly. Apixa fields are plain values and win on
 * name clashes only where the caller put them in `extra` (callers keep clashing operations out).
 */
export function composeResult<T extends object>(
  native: object | undefined,
  extra: Record<string, unknown>,
): T {
  const result: Record<string, unknown> = {};
  if (native) {
    // Object.keys on the Proxy uses the ownKeys trap, which TanStack does not track.
    for (const key of Object.keys(native)) {
      if (key in extra) continue;
      Object.defineProperty(result, key, {
        enumerable: true,
        get: () => (native as Record<string, unknown>)[key],
      });
    }
  }
  for (const [key, value] of Object.entries(extra)) {
    Object.defineProperty(result, key, { enumerable: true, value });
  }
  return result as T;
}
