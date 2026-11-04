/// <reference path="../ambient-mocking-datasets.d.ts" />
import { MockError } from "../errors/index.js";
import type { MockDatasetCatalog, MockDatasetId } from "../types/mock-datasets.js";

/**
 * Lightweight runtime metadata for the built-in catalog: id → identity field. No records live
 * here; `@apixa/mocking/datasets` loads the selected dataset on demand. A test in
 * `tests/mocking/datasets-catalog.test.ts` keeps this list and the loader catalog identical.
 */
export const MOCK_DATASETS = {
  "users-mock": "id",
  "products-mock": "id",
  "companies-mock": "id",
  "orders-mock": "id",
  "posts-mock": "id",
  "comments-mock": "id",
  "countries-csc": "id",
  "countries-mledoze": "id",
  "countries-parseapi": "country",
  "country-codes-iso": "id",
  "cities-capitals": "id",
  "currencies-parseapi": "currency",
  "languages-parseapi": "language",
  "timezones-parseapi": "timezone",
  "area-codes-parseapi": "area_code",
} as const satisfies { [K in MockDatasetId]: MockDatasetCatalog[K]["idKey"] };

export function isMockDatasetId(value: unknown): value is MockDatasetId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MOCK_DATASETS, value);
}

export function listMockDatasetIds(): MockDatasetId[] {
  return Object.keys(MOCK_DATASETS) as MockDatasetId[];
}

/** Load one dataset's records through the optional `@apixa/mocking` peer (lazy, per dataset). */
export async function loadNamedDataset(id: MockDatasetId): Promise<readonly unknown[]> {
  let mod: { loadDatasetRecords(id: string): Promise<readonly unknown[]> };
  try {
    mod = await import("@apixa/mocking/datasets");
  } catch (cause) {
    throw new MockError(
      "MOCK_LOAD",
      `mock: "${id}" needs the optional peer "@apixa/mocking" (it ships the dataset records). ` +
        `Install it, or pass inline records / a provider instead.`,
      { cause },
    );
  }
  return mod.loadDatasetRecords(id);
}
