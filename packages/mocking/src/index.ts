/**
 * Browser-safe public surface.
 *
 * - `defineMockApi()` — standalone in-memory mock API (no `defineApi()`, no network), built on
 *   Core's shared mock engine so its operations behave exactly like Core mocked resources.
 * - Core `defineApi` resources accept `mock: "<dataset-id>" | records | provider` directly; Core
 *   uses `@apixa/mocking/register` to opt in to the lazy named-dataset loader.
 *
 * Node filesystem loaders live at `@apixa/mocking/node`; typed records at `@apixa/mocking/datasets`.
 */

export { defineMockApi } from "./mock-api.js";
/** The virtual file store of mocked Core resources (see `mockFiles(api)`). */
export { mockFiles, isMockFileRef, MockFileStorage } from "@apixa/core";
export type { MockFileMeta, MockStoredFile } from "@apixa/core";
export type {
  MockApi,
  MockApiConfig,
  MockApiConfigInput,
  MockApiResourceInput,
  MockResourceConfig,
} from "./mock-api.js";
export type {
  MockResource,
  MockResourceDefaults,
  MockOperationContext,
  MockOperationFn,
  MockOperationValue,
  Page,
  CursorPage,
  PaginationConfig,
  PageParams,
  ResourceInput,
} from "./resource.js";
export { MockingErrors, InvalidSliceError, MockApiError, type MockApiErrorCode } from "./errors.js";
export type { MockSlice } from "./slice.js";
export type { DatasetId } from "./catalog.js";
export { listDatasetIds } from "./catalog.js";
export { loadDataset } from "./loader.js";

export type {
  Dataset,
  DatasetFieldSchema,
  DatasetListItem,
  DatasetMeta,
  DatasetResourceHint,
  DatasetSchema,
} from "./types.js";
