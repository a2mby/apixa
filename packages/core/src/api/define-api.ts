import type { ApiClient, ApiInput, InferredApiInput, ValidateConfig } from "../types/inference.js";
import type { ApiStateOf } from "../types/definition.js";
import { buildClient } from "./client.js";

/**
 * Explicit metadata: `defineApi<AppApi>()({ … })`. `AppApi` supplies payload types only; the
 * runtime config decides which resources and operations exist.
 */
export function defineApi<T extends ApiStateOf<T>>(): <const Config extends ApiInput<T>>(
  config: Config & ValidateConfig<T, NoInfer<Config>>,
) => ApiClient<T, Config>;

/** Inferred: types come from the runtime config (and its mock data). */
export function defineApi<const Config extends InferredApiInput>(
  config: Config & ValidateConfig<{}, NoInfer<Config>>,
): ApiClient<{}, Config>;

export function defineApi(config?: unknown): unknown {
  if (arguments.length === 0) return (curried: unknown) => buildClient(curried);
  return buildClient(config);
}
