import type {
  ApiClient,
  ApiInput,
  HandlerCapture,
  HandlerOverlay,
  InferredApiInput,
  ValidateConfig,
} from "../types/inference.js";
import type { ApiStateOf } from "../types/definition.js";
import { buildClient } from "./client.js";

/**
 * Explicit metadata: `defineApi<AppApi>()({ … })`. `AppApi` supplies payload types only; the
 * runtime config decides which resources and operations exist.
 */
export function defineApi<T extends ApiStateOf<T>>(): <
  const Config extends ApiInput<T>,
  const M extends Record<string, unknown> = {},
  const RP extends Record<string, unknown> = {},
  const OP extends Record<string, Record<string, unknown>> = {},
>(
  config: Config &
    ValidateConfig<T, NoInfer<Config>> &
    HandlerCapture<M, RP, OP> &
    HandlerOverlay<T, M, RP, OP>,
) => ApiClient<T, Config>;

/** Inferred: types come from the runtime config (and its mock data). */
export function defineApi<
  const Config extends InferredApiInput,
  const M extends Record<string, unknown> = {},
  const RP extends Record<string, unknown> = {},
  const OP extends Record<string, Record<string, unknown>> = {},
>(
  config: Config &
    ValidateConfig<{}, NoInfer<Config>> &
    HandlerCapture<M, RP, OP> &
    HandlerOverlay<{}, M, RP, OP>,
): ApiClient<{}, Config>;

export function defineApi(config?: unknown): unknown {
  if (arguments.length === 0) return (curried: unknown) => buildClient(curried);
  return buildClient(config);
}
