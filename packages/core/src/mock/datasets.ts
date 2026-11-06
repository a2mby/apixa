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

/** Loader installed explicitly by an optional dataset integration. Records remain lazy. */
export type MockDatasetLoader = (id: string) => Promise<readonly unknown[]>;
let datasetLoader: MockDatasetLoader | undefined;

/** Register the named-dataset loader. Mock stores and data remain scoped to each client. */
export function registerMockDatasetLoader(loader: MockDatasetLoader): void {
  datasetLoader = loader;
}

/** Load one dataset through the explicitly registered optional integration. */
export async function loadNamedDataset(id: MockDatasetId): Promise<readonly unknown[]> {
  if (!datasetLoader) {
    throw new MockError(
      "MOCK_LOAD",
      `mock: "${id}" needs the optional "@apixa/mocking" integration. ` +
        `Install it and import "@apixa/mocking/register", or pass inline records / a provider instead.`,
    );
  }
  return datasetLoader(id);
}
