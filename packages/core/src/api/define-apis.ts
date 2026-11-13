import { ApiError, ConfigError } from "../errors/index.js";
import type {
  ApisClient,
  ApisHandlerCapture,
  ApisHandlerOverlay,
  ApisInput,
  InferredApisInput,
  StructuralApisInput,
  ValidateApisConfig,
} from "../types/inference.js";
import { buildClient } from "./client.js";
import { isPlainObject } from "./validate.js";

function build(configs: unknown): unknown {
  if (!isPlainObject(configs)) {
    throw new ConfigError(
      `defineApis() expects an object of named client configs (e.g. { backend: { baseURL, resources } }).`,
    );
  }
  const out: Record<string, unknown> = {};
  for (const [name, config] of Object.entries(configs)) {
    try {
      out[name] = buildClient(config);
    } catch (error) {
      if (error instanceof ApiError && error.code === "CONFIG") {
        throw new ConfigError(`defineApis.${name}: ${error.message}`, { cause: error });
      }
      throw error;
    }
  }
  return Object.freeze(out);
}

/**
 * Several independent clients in one object: `apis.backend.users.getAll()`. Each entry is built
 * by the same engine as `defineApi()` — separate base URLs, headers, transports, mock stores.
 */
export function defineApis<Defs extends { [K in keyof Defs]: object }>(): <
  const Configs extends StructuralApisInput,
  const M extends Record<string, Record<string, unknown>> = {},
  const RP extends Record<string, Record<string, unknown>> = {},
  const OP extends Record<string, Record<string, Record<string, unknown>>> = {},
>(
  configs: Configs &
    NoInfer<ApisInput<Defs>> &
    ValidateApisConfig<Defs, NoInfer<Configs>> &
    ApisHandlerCapture<M, RP, OP> &
    ApisHandlerOverlay<Defs, M, RP, OP>,
) => ApisClient<Defs, Configs>;

export function defineApis<
  const Configs extends StructuralApisInput,
  const M extends Record<string, Record<string, unknown>> = {},
  const RP extends Record<string, Record<string, unknown>> = {},
  const OP extends Record<string, Record<string, Record<string, unknown>>> = {},
>(
  configs: Configs &
    NoInfer<InferredApisInput> &
    ValidateApisConfig<{}, NoInfer<Configs>> &
    ApisHandlerCapture<M, RP, OP> &
    ApisHandlerOverlay<{}, M, RP, OP>,
): ApisClient<{}, Configs>;

export function defineApis(configs?: unknown): unknown {
  if (arguments.length === 0) return (curried: unknown) => build(curried);
  return build(configs);
}
