/**
 * Browser-safe public surface.
 * Node filesystem loaders live at `@apixa/mocking/node`.
 */
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
  type CreateMockTransportOptions,
} from "./transport.js";
