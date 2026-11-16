import type {
  ApiClient,
  ApiInput,
  HandlerCapture,
  HandlerOverlay,
  InferredApiInput,
  StructuralApiInput,
  ValidateConfig,
} from "../types/inference.js";
import type { ApiStateOf } from "../types/definition.js";
import { buildClient } from "./client.js";

/**
 * Explicit metadata: `defineApi<AppApi>()({ … })`. `AppApi` maps resource names to entity types only; the
 * runtime config decides which resources and operations exist, and each operation's `schema`
 * defines its custom body, query and response types.
 */
export function defineApi<T extends ApiStateOf<T>>(): <
  const Config extends StructuralApiInput,
  const M extends Record<string, unknown> = {},
  const RP extends Record<string, unknown> = {},
  const OP extends Record<string, Record<string, unknown>> = {},
>(
  config: Config &
    NoInfer<ApiInput<T>> &
    ValidateConfig<T, NoInfer<Config>> &
    HandlerCapture<M, RP, OP> &
    HandlerOverlay<M, RP, OP>,
) => ApiClient<T, Config>;

/** Inferred: types come from the runtime config (and its mock data). */
export function defineApi<
  const Config extends StructuralApiInput,
  const M extends Record<string, unknown> = {},
  const RP extends Record<string, unknown> = {},
  const OP extends Record<string, Record<string, unknown>> = {},
>(
  config: Config &
    NoInfer<InferredApiInput> &
    ValidateConfig<{}, NoInfer<Config>> &
    HandlerCapture<M, RP, OP> &
    HandlerOverlay<M, RP, OP>,
): ApiClient<{}, Config>;

export function defineApi(config?: unknown): unknown {
  if (arguments.length === 0) return (curried: unknown) => buildClient(curried);
  return buildClient(config);
}
