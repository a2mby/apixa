/**
 * Browser-safe public surface.
 * Importing this package enables resource-level `mock` / `mockConfig` on Core `defineApi`.
 * Node filesystem loaders live at `@apixa/mocking/node`.
 */
import { enableResourceMocks } from "./register.js";

// Register Core processor (side effect) so `import "@apixa/mocking"` is enough.
enableResourceMocks();

// Register built-in typed presets.
import "./data/users.js";
import "./data/users-mock.js";

export type {
  Dataset,
  DatasetFieldSchema,
  DatasetListItem,
  DatasetMeta,
  DatasetResourceHint,
  DatasetSchema,
} from "./types.js";

export {
  createMockTransport,
  createSelectiveMockTransport,
  type CreateMockTransportOptions,
  type SelectiveMockTransportOptions,
} from "./transport.js";

export {
  registerDatasetPreset,
  getDatasetPreset,
  listDatasetPresetIds,
  clearDatasetPresets,
} from "./presets/registry.js";

export { enableResourceMocks, disableResourceMocks } from "./register.js";
