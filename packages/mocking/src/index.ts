/**
 * Browser-safe public surface.
 *
 * - `defineMockApi()` — standalone, in-memory mock API (no `defineApi()`, no network).
 * - Resource-level `mock` / `mockConfig` on Core `defineApi`: Core lazy-loads
 *   `@apixa/mocking/register` when those keys are present (no side-effect import required).
 *   You can still call `enableResourceMocks()` or import `@apixa/mocking/register` explicitly.
 *
 * Node filesystem loaders live at `@apixa/mocking/node`; typed data at `@apixa/mocking/data`.
 */

export { defineMockApi } from "./mock-api.js";
export type { MockApi, MockApiConfig, MockResourceConfig } from "./mock-api.js";
export type { MockResource, Page, PageParams, ResourceInput } from "./resource.js";
export { MockApiError, type MockApiErrorCode } from "./errors.js";
export type { DatasetId } from "./catalog.js";

export type {
  Dataset,
  DatasetFieldSchema,
  DatasetListItem,
  DatasetMeta,
  DatasetResourceHint,
  DatasetSchema,
} from "./types.js";

export {
  registerDatasetPreset,
  getDatasetPreset,
  listDatasetPresetIds,
  clearDatasetPresets,
} from "./presets/registry.js";

export { enableResourceMocks, disableResourceMocks } from "./register.js";
export {
  applyResourceMocksToConfig,
  createSelectiveMockTransportFromSpecs,
  type ResourceMockSpec,
} from "./bridge.js";
