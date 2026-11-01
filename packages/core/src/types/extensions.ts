import type { MockDatasetIds } from "./mock-dataset-ids.js";

/**
 * Optional keys on every resource bag in `defineApi`.
 * Available without importing `@apixa/mocking` — Core owns these types.
 */
export interface ResourceExtensions {
  /**
   * Cap how much list data this resource returns from `getAll` (array responses).
   * First N rows, or half-open `{ start, end }`. Overshoot returns all rows.
   * When `mock` is set, `@apixa/mocking` also uses this as the seed window.
   */
  slice?: number | { start: number; end: number };
  /**
   * Dataset id — enables `@apixa/mocking` for this resource (optional peer at runtime).
   * Known ids autocomplete from `MockDatasetIds`; custom strings still type-check.
   */
  mock?: keyof MockDatasetIds | (string & {});
  /**
   * When true with `mock`, list GET / `getAll` returns a page envelope
   * (`data`, `total`, `page`, `pageSize`, `previous`, `next`).
   */
  pagination?: boolean;
}

export interface OperationExtensions {}
