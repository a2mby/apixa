import type { MockDatasetIds } from "./mock-dataset-ids.js";

/**
 * Optional keys on every resource bag in `defineApi`.
 * Available without importing `@apixa/mocking` — Core owns these types.
 */
export interface ResourceExtensions {
  /**
   * Cap how much list data this resource returns from `getAll` (array responses).
   * First N rows, or half-open `{ start, end }`. Overshoot returns all rows.
   * When `mock: true`, `@apixa/mocking` also uses this as the seed window.
   */
  slice?: number | { start: number; end: number };
  /**
   * When true, `@apixa/mocking` handles this resource (optional peer at runtime).
   */
  mock?: boolean;
  mockConfig?: {
    type: keyof MockDatasetIds | (string & {});
    pagination?: boolean;
    [key: string]: unknown;
  };
}

export interface OperationExtensions {}
