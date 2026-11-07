import { createResourceKeys } from "./keys.js";
import {
  createResourceMutationController,
  type ResourceMutationController,
} from "./mutation-controller.js";
import { createResourceQueryController, type ResourceQueryController } from "./query-controller.js";
import type {
  CreateResourceControllerConfig,
  InferCreateBody,
  InferEntity,
  InferListData,
  InferUpdateBody,
  InferUpdateId,
} from "./types.js";

/** Compatibility shape: query controller + create/update/delete mutation options on one key factory. */
export type ResourceController<TResource extends object> = ResourceQueryController<TResource> &
  ResourceMutationController<TResource>;

/**
 * Advanced compatibility factory composing the query and mutation controllers over one shared
 * key factory. Prefer `createResourceQueryController` / `createResourceMutationController`.
 */
export function createResourceController<TResource extends object>(
  resource: TResource,
  config: CreateResourceControllerConfig,
): ResourceController<TResource> {
  const keys = createResourceKeys(config);
  return {
    ...createResourceQueryController(resource, config, keys),
    ...createResourceMutationController(resource, config, keys),
  };
}

export type { InferCreateBody, InferEntity, InferListData, InferUpdateBody, InferUpdateId };
