/**
 * Advanced / escape-hatch exports.
 * Prefer `useResourceQuery` from `@apixa/tanstack-query` for normal CRUD.
 */

export { createResourceController } from "./controller.js";
export type { ResourceController } from "./controller.js";

export { createResourceKeys } from "./keys.js";

export { syncCacheAfterCreate, syncCacheAfterUpdate, syncCacheAfterDelete } from "./cache.js";

export type {
  ResourceLike,
  ResourceKeyFactory,
  CreateResourceControllerConfig,
  InferListData,
  InferEntity,
  InferCreateBody,
  InferUpdateBody,
  UpdateVariables,
} from "./types.js";
