/**
 * Browser-safe public surface.
 *
 * - `defineMockApi()` — standalone, in-memory mock API (no `defineApi()`, no network).
 * - Importing this package also enables resource-level `mock` / `mockConfig` on Core `defineApi`
 *   (legacy bridge: `register.ts`, `processor.ts`, `store.ts`, `transport.ts`). The standalone
 *   modules never import it.
 *
 * Node filesystem loaders live at `@apixa/mocking/node`; typed data at `@apixa/mocking/data`.
 */
import { enableResourceMocks } from "./register.js";

// Register Core processor (side effect) so `import "@apixa/mocking"` is enough for `mock: true`.
enableResourceMocks();

// Register built-in typed presets for that processor.
import "./data/users.js";
import "./data/users-mock.js";

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
