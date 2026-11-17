import { ApiError, ConfigError } from "../errors/index.js";
import type { ApisCollectionOptions } from "../types/definition.js";
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
import { resolveApisOptions } from "./settings.js";
import { isPlainObject } from "./validate.js";

type CollectionParse<Options> = Options extends { settings: { response: { parse: infer P } } }
  ? [P] extends [undefined]
    ? never
    : P
  : never;

function build(configs: unknown, options?: unknown): unknown {
  if (!isPlainObject(configs)) {
    throw new ConfigError(
      `defineApis() expects an object of named client configs (e.g. { backend: { baseURL, resources } }).`,
    );
  }
  const collection = resolveApisOptions(options);
  const out: Record<string, unknown> = {};
  for (const [name, config] of Object.entries(configs)) {
    try {
      out[name] = buildClient(config, collection);
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
  const Options extends ApisCollectionOptions | undefined = undefined,
  const M extends Record<string, Record<string, unknown>> = {},
  const RP extends Record<string, Record<string, unknown>> = {},
  const OP extends Record<string, Record<string, Record<string, unknown>>> = {},
>(
  configs: Configs &
    NoInfer<ApisInput<Defs>> &
    ValidateApisConfig<
      Defs,
      NoInfer<Configs>,
      Options extends { settings: { validation: { strict: true } } } ? true : false
    > &
    ApisHandlerCapture<M, RP, OP> &
    ApisHandlerOverlay<M, RP, OP>,
  options?: Options,
) => ApisClient<Defs, Configs, CollectionParse<Options>>;

export function defineApis<
  const Configs extends StructuralApisInput,
  const Options extends ApisCollectionOptions | undefined = undefined,
  const M extends Record<string, Record<string, unknown>> = {},
  const RP extends Record<string, Record<string, unknown>> = {},
  const OP extends Record<string, Record<string, Record<string, unknown>>> = {},
>(
  configs: Configs &
    NoInfer<InferredApisInput> &
    ValidateApisConfig<
      {},
      NoInfer<Configs>,
      Options extends { settings: { validation: { strict: true } } } ? true : false
    > &
    ApisHandlerCapture<M, RP, OP> &
    ApisHandlerOverlay<M, RP, OP>,
  options?: Options,
): ApisClient<{}, Configs, CollectionParse<Options>>;

export function defineApis(configs?: unknown, options?: unknown): unknown {
  if (arguments.length === 0) {
    return (curried: unknown, curriedOptions?: unknown) => build(curried, curriedOptions);
  }
  return build(configs, options);
}
