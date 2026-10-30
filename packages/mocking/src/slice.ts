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

/** Config-time check for `defineMockApi` / mockConfig shape (not range order). */
export function assertSliceConfig(slice: unknown, label: string): asserts slice is MockSlice {
  if (typeof slice === "number") {
    if (!Number.isInteger(slice) || slice < 0) {
      throw new InvalidSliceError(
        `${label}: slice must be a non-negative integer (got ${String(slice)}).`,
      );
    }
    return;
  }
  if (!isPlainSliceRange(slice)) {
    throw new InvalidSliceError(
      `${label}: slice must be a non-negative integer or { start, end }.`,
    );
  }
  const { start, end } = slice;
  if (typeof start !== "number" || !Number.isInteger(start) || start < 0) {
    throw new InvalidSliceError(
      `${label}: slice.start must be a non-negative integer (got ${String(start)}).`,
    );
  }
  if (typeof end !== "number" || !Number.isInteger(end) || end < 0) {
    throw new InvalidSliceError(
      `${label}: slice.end must be a non-negative integer (got ${String(end)}).`,
    );
  }
}

/**
 * Apply `slice` to records.
 * - `number`: first N rows; if N exceeds length, return all.
 * - `{ start, end }`: Array.slice window; if `end` exceeds length, return all;
 *   if `end < start`, throw `InvalidSliceError`.
 */
export function applySlice<T>(records: T[], slice: MockSlice | undefined, label = "slice"): T[] {
  if (slice === undefined) return records;

  if (typeof slice === "number") {
    if (!Number.isInteger(slice) || slice < 0) {
      throw new InvalidSliceError(
        `${label}: slice must be a non-negative integer (got ${String(slice)}).`,
      );
    }
    if (slice >= records.length) return records.slice();
    return records.slice(0, slice);
  }

  if (!isPlainSliceRange(slice)) {
    throw new InvalidSliceError(
      `${label}: slice must be a non-negative integer or { start, end }.`,
    );
  }

  const { start, end } = slice;
  if (typeof start !== "number" || !Number.isInteger(start) || start < 0) {
    throw new InvalidSliceError(
      `${label}: slice.start must be a non-negative integer (got ${String(start)}).`,
    );
  }
  if (typeof end !== "number" || !Number.isInteger(end) || end < 0) {
    throw new InvalidSliceError(
      `${label}: slice.end must be a non-negative integer (got ${String(end)}).`,
    );
  }
  if (end < start) {
    throw new InvalidSliceError(
      `${label}: slice.end (${end}) must not be before slice.start (${start}).`,
    );
  }
  if (end > records.length) return records.slice();
  return records.slice(start, end);
}

/** Parse optional slice from a mockConfig / resource bag; throws on bad shape. */
export function readSliceOption(value: unknown, label: string): MockSlice | undefined {
  if (value === undefined) return undefined;
  assertSliceConfig(value, label);
  return value;
}
