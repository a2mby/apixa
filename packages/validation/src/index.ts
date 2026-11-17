// `apixa/validation`: Apixa's `defineApi` with Zod-friendly schemas. A plain object of Zod schemas
// inside `schema.body`, `schema.query` or `schema.response` is read as `z.object(...)`, nested
// objects included. Anything that is already a Standard Schema V1 validator (a Zod schema of any
// kind, Valibot, ArkType, ...) is passed to Core untouched, and Core stays validator-agnostic.
import {
  ConfigError,
  defineApi as coreDefineApi,
  isStandardSchema,
  type ApiClient,
  type ApiInput,
  type ApiStateOf,
  type HandlerCapture,
  type HandlerOverlay,
  type StandardSchemaV1,
  type StructuralApiInput,
  type ValidateConfig,
} from "@apixa/core";
import { z } from "zod";

export { z };

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

/** A plain object whose values are Zod schemas or further plain objects (read as `z.object`). */
export interface SchemaShape {
  readonly [key: string]: z.ZodType | SchemaShape;
}

/** What `schema.body` / `schema.query` / `schema.response` accept here. */
export type SchemaDeclaration = StandardSchemaV1 | SchemaShape;

/** The `schema` option under `apixa/validation`: same explicit object, shorthand-capable values. */
export interface ShorthandOperationSchema {
  body?: SchemaDeclaration;
  query?: SchemaDeclaration;
  response?: SchemaDeclaration;
  error?: SchemaDeclaration | false;
  entity?: false;
}

type ResolveValue<V> = V extends z.ZodType ? V : V extends SchemaShape ? ResolveShape<V> : never;

/** The Zod schema a declaration stands for: validators stay as they are, shapes become `z.object`. */
export type ResolveShape<D> = D extends StandardSchemaV1
  ? D
  : D extends SchemaShape
    ? z.ZodObject<{ -readonly [K in keyof D]: ResolveValue<D[K]> }, z.core.$strip>
    : D;

type ResolveSchema<S> = S extends object
  ? {
      -readonly [K in keyof S]: K extends "body" | "query" | "response"
        ? ResolveShape<S[K]>
        : K extends "error"
          ? [S[K]] extends [false]
            ? false
            : ResolveShape<S[K]>
          : S[K];
    }
  : S;

type ResolveOperation<Op> = Op extends { schema: infer S }
  ? Omit<Op, "schema"> & { schema: ResolveSchema<S> }
  : Op;

type ResolveOperations<Ops> = Ops extends string | readonly unknown[]
  ? Ops
  : { [K in keyof Ops]: K extends "preset" ? Ops[K] : ResolveOperation<Ops[K]> };

type ResolveResourceSchema<S> = S extends object
  ? {
      -readonly [K in keyof S]: K extends "response" | "error" ? ResolveShape<S[K]> : S[K];
    }
  : S;

type ResolveResource<R> = (
  R extends { schema: infer S } ? Omit<R, "schema"> & { schema: ResolveResourceSchema<S> } : R
) extends infer WithSchema
  ? WithSchema extends { operations: infer Ops }
    ? Omit<WithSchema, "operations"> & { operations: ResolveOperations<Ops> }
    : WithSchema
  : R;

/** The configuration as Core sees it once shorthand has become `z.object(...)`. */
export type ResolveConfig<C> = C extends { resources: infer Res }
  ? Omit<C, "resources"> & { resources: { [K in keyof Res]: ResolveResource<Res[K]> } }
  : C;

// ---------------------------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isZod(value: unknown): value is z.ZodType {
  return value !== null && typeof value === "object" && "_zod" in value;
}

function shapeOf(value: Record<string, unknown>, where: string): z.ZodType {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isZod(entry)) shape[key] = entry;
    else if (isPlainObject(entry) && !isStandardSchema(entry)) {
      shape[key] = shapeOf(entry, `${where}.${key}`);
    } else {
      throw new ConfigError(
        `${where}.${key}: Expected a Zod schema or a plain object of Zod schemas. Arrays, primitives, unions and nullable values need an explicit Zod schema (z.array(...), z.string(), ...).`,
      );
    }
  }
  return z.object(shape);
}

/** A Standard Schema stays as it is; a plain object becomes `z.object`; anything else is rejected. */
function resolveDeclaration(value: unknown, where: string): unknown {
  if (isStandardSchema(value)) return value;
  if (isPlainObject(value)) return shapeOf(value, where);
  return value; // Core reports invalid values with the offending option named.
}

function resolveOperation(value: unknown, where: string): unknown {
  if (!isPlainObject(value) || !isPlainObject(value.schema)) return value;
  const schema: Record<string, unknown> = { ...value.schema };
  for (const key of ["body", "query", "response", "error"] as const) {
    if (schema[key] !== undefined && schema[key] !== false) {
      schema[key] = resolveDeclaration(schema[key], `${where}.schema.${key}`);
    }
  }
  return { ...value, schema };
}

function resolveResource(value: unknown, where: string): unknown {
  if (!isPlainObject(value)) return value;
  let next = value;
  if (isPlainObject(value.schema)) {
    const schema: Record<string, unknown> = { ...value.schema };
    for (const key of ["response", "error"] as const) {
      if (schema[key] !== undefined) {
        schema[key] = resolveDeclaration(schema[key], `${where}.schema.${key}`);
      }
    }
    next = { ...next, schema };
  }
  if (!isPlainObject(value.operations)) return next;
  const operations: Record<string, unknown> = {};
  for (const [name, op] of Object.entries(value.operations)) {
    operations[name] = name === "preset" ? op : resolveOperation(op, `${where}.operations.${name}`);
  }
  return { ...next, operations };
}

/** Copy of `config` with shorthand schemas resolved; the caller's objects are never mutated. */
function resolveConfig(config: unknown): unknown {
  if (!isPlainObject(config) || !isPlainObject(config.resources)) return config;
  const resources: Record<string, unknown> = {};
  for (const [name, resource] of Object.entries(config.resources)) {
    resources[name] = resolveResource(resource, `resources.${name}`);
  }
  return { ...config, resources };
}

// ---------------------------------------------------------------------------------------------
// defineApi
// ---------------------------------------------------------------------------------------------

/**
 * `defineApi` for Zod users. Identical to the core `defineApi` (same options, same inference,
 * same runtime) except that a plain object in `schema.body`, `schema.query` or `schema.response`
 * is read as `z.object(...)`.
 *
 * ```ts
 * import { defineApi, z } from "apixa/validation";
 * defineApi<ApiState>()({ baseURL, resources: { products: { path: "/products", operations: {
 *   create: { schema: { body: { name: z.string(), price: z.number() }, response: ProductSchema } },
 * } } } });
 * ```
 */
export function defineApi<T extends ApiStateOf<T>>(): <
  const Config extends StructuralApiInput,
  const M extends Record<string, unknown> = {},
  const RP extends Record<string, unknown> = {},
  const OP extends Record<string, Record<string, unknown>> = {},
>(
  config: Config &
    NoInfer<ApiInput<T, ShorthandOperationSchema>> &
    ValidateConfig<T, NoInfer<ResolveConfig<Config>>> &
    HandlerCapture<M, RP, OP, ShorthandOperationSchema> &
    HandlerOverlay<M, RP, OP, ShorthandOperationSchema>,
) => ApiClient<T, ResolveConfig<Config>>;

/** Inferred: types come from the runtime config (and its mock data). */
export function defineApi<
  const Config extends StructuralApiInput,
  const M extends Record<string, unknown> = {},
  const RP extends Record<string, unknown> = {},
  const OP extends Record<string, Record<string, unknown>> = {},
>(
  config: Config &
    NoInfer<ApiInput<{}, ShorthandOperationSchema>> &
    ValidateConfig<{}, NoInfer<ResolveConfig<Config>>> &
    HandlerCapture<M, RP, OP, ShorthandOperationSchema> &
    HandlerOverlay<M, RP, OP, ShorthandOperationSchema>,
): ApiClient<{}, ResolveConfig<Config>>;

export function defineApi(config?: unknown): unknown {
  const define = coreDefineApi as (config?: unknown) => unknown;
  if (arguments.length === 0) {
    const curried = define() as (config: unknown) => unknown;
    return (given: unknown) => curried(resolveConfig(given));
  }
  return define(resolveConfig(config));
}
