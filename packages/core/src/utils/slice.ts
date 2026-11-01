/** Limit how much list data a resource returns: first N rows, or half-open `{ start, end }`. */
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
    if (!Number.isInteger(slice) || slice < 0) {
      throw new Error(`${label}: must be a non-negative integer (got ${String(slice)}).`);
    }
    return;
  }
  if (!isPlainSliceRange(slice)) {
    throw new Error(`${label}: must be a non-negative integer or { start, end }.`);
  }
  const { start, end } = slice;
  if (typeof start !== "number" || !Number.isInteger(start) || start < 0) {
    throw new Error(`${label}.start must be a non-negative integer (got ${String(start)}).`);
  }
  if (typeof end !== "number" || !Number.isInteger(end) || end < 0) {
    throw new Error(`${label}.end must be a non-negative integer (got ${String(end)}).`);
  }
  if (end < start) {
    throw new Error(`${label}.end (${end}) must not be before ${label}.start (${start}).`);
  }
}

/** Apply `slice` to a list array. Overshoot returns all rows. */
export function applyResourceSlice<T>(
  records: T[],
  slice: ResourceSlice | undefined,
  label = "slice",
): T[] {
  if (slice === undefined) return records;
  assertResourceSlice(slice, label);

  if (typeof slice === "number") {
    if (slice >= records.length) return records.slice();
    return records.slice(0, slice);
  }

  if (slice.end > records.length) return records.slice();
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
