/** Apply `Array.prototype.slice` to a list, with a count or half-open `{ start, end }`. */
export type ResourceSlice = number | { start: number; end: number };

function isPlainSliceRange(value: unknown): value is { start: number; end: number } {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as object).every((k) => k === "start" || k === "end")
  );
}

export function assertResourceSlice(
  slice: unknown,
  label = "slice",
): asserts slice is ResourceSlice {
  if (typeof slice === "number") {
    return;
  }
  if (!isPlainSliceRange(slice)) {
    throw new Error(`${label}: must be a number or { start, end }.`);
  }
  const { start, end } = slice;
  if (typeof start !== "number") {
    throw new Error(`${label}.start must be a number (got ${String(start)}).`);
  }
  if (typeof end !== "number") {
    throw new Error(`${label}.end must be a number (got ${String(end)}).`);
  }
}

/** Apply native slice semantics to a list array. */
export function applyResourceSlice<T>(
  records: T[],
  slice: ResourceSlice | undefined,
  label = "slice",
): T[] {
  if (slice === undefined) return records;
  assertResourceSlice(slice, label);

  if (typeof slice === "number") {
    return records.slice(0, slice);
  }

  return records.slice(slice.start, slice.end);
}

/**
 * If `data` is a list array, apply `slice`. Page envelopes and other shapes pass through.
 */
export function applyResourceSliceToListResult(
  data: unknown,
  slice: ResourceSlice | undefined,
): unknown {
  if (slice === undefined || !Array.isArray(data)) return data;
  return applyResourceSlice(data, slice);
}
