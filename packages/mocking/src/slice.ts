import { InvalidSliceError } from "./errors.js";

/** Take the first N records, or a half-open `[start, end)` range (Array.slice semantics). */
export type MockSlice = number | { start: number; end: number };

function isPlainSliceRange(value: unknown): value is { start: number; end: number } {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as object).every((k) => k === "start" || k === "end")
  );
}

/** Config-time check for `defineMockApi` / resource `slice` shape (not range order). */
export function assertSliceConfig(slice: unknown, label: string): asserts slice is MockSlice {
  if (typeof slice === "number") {
    return;
  }
  if (!isPlainSliceRange(slice)) {
    throw new InvalidSliceError(`${label}: slice must be a number or { start, end }.`);
  }
  const { start, end } = slice;
  if (typeof start !== "number") {
    throw new InvalidSliceError(`${label}: slice.start must be a number (got ${String(start)}).`);
  }
  if (typeof end !== "number") {
    throw new InvalidSliceError(`${label}: slice.end must be a number (got ${String(end)}).`);
  }
}

/** Apply native array slicing to records. */
export function applySlice<T>(records: T[], slice: MockSlice | undefined, label = "slice"): T[] {
  if (slice === undefined) return records;
  assertSliceConfig(slice, label);
  return typeof slice === "number"
    ? records.slice(0, slice)
    : records.slice(slice.start, slice.end);
}

/** Parse optional slice from a resource bag; throws on bad shape. */
export function readSliceOption(value: unknown, label: string): MockSlice | undefined {
  if (value === undefined) return undefined;
  assertSliceConfig(value, label);
  return value;
}
