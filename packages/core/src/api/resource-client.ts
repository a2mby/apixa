import { ConfigError } from "../errors/index.js";
import { extractPathParamNames, joinPath } from "../http/path.js";
import { MockStore, normalizeMockSource, type BuiltinIntent } from "../mock/index.js";
import { DEFAULT_MULTIPART, type MultipartRuntime } from "../http/multipart.js";
import {
  BUILTIN_CONVENTIONS,
  expandOperations,
  isBuiltinName,
  parseOperationArgs,
} from "../operation/index.js";
import type { BuiltinConventionName, OperationInput } from "../operation/index.js";
import {
  resolveRetryConfig,
  runOperation,
  type CallInput,
  type ClientRuntime,
  type PreparedOperation,
  type ResourceRuntime,
} from "../request/index.js";
import { convertKey } from "../transform/keys.js";
import {
  resolveFieldRules,
  resolveResponseAccept,
  type ResolvedFieldRules,
} from "../validation/index.js";
import type { OperationFn, OperationFnContext, OperationFnRequestInit } from "../types/builtins.js";
import { validateMethodKind } from "./validate.js";
import type {
  FileFieldOptions,
  FileLimits,
  LayerOptions,
  MultipartOptions,
  OperationDefinition,
  OperationRunDefinition,
} from "../types/definition.js";
import {
  OPERATION_METADATA,
  registerIdempotencyGenerators,
  type OperationMetadata,
} from "./metadata.js";
import type { HeadersSource, PathParams, QueryParams } from "../types/http.js";
import type { RetryOption } from "../types/retry.js";
import type { RequestOptions } from "../types/transport.js";
import { randomUUID } from "../utils/uuid.js";
import { applyResourceSliceToListResult, type ResourceSlice } from "../utils/slice.js";

type Fn = (...args: unknown[]) => Promise<unknown>;

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

/** Most specific defined value wins; `false` retry at a lower level disables inherited retry. */
function pick<T>(...values: Array<T | undefined>): T | undefined {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] !== undefined) return values[i];
  return undefined;
}

/** Merge root → resource → operation layers once, at construction. */
function prepareLayers(where: string, layers: Array<LayerOptions | undefined>) {
  const present = layers.filter((l): l is LayerOptions => l !== undefined);
  const retry = pick<RetryOption>(...present.map((l) => l.retry));
  return {
    headers: present.map((l) => l.headers).filter((h): h is HeadersSource => h !== undefined),
    timeout: pick(...present.map((l) => l.timeout)),
    retry: resolveRetryConfig(retry, `${where}.retry`),
    onRequest: present.flatMap((l) => [
      ...(l.middleware?.onRequest ? [l.middleware.onRequest] : []),
      ...(l.requestMiddleware ?? []),
    ]),
    onResponse: present.flatMap((l) => [
      ...(l.middleware?.onResponse ? [l.middleware.onResponse] : []),
      ...(l.responseMiddleware ?? []),
    ]),
    onError: present.flatMap((l) => (l.middleware?.onError ? [l.middleware.onError] : [])),
    requestKeys: pick(...present.map((l) => l.transforms?.request?.keys)),
    responseKeys: pick(...present.map((l) => l.transforms?.response?.keys)),
  };
}

/** Public file-field names → wire names (request key transform), with optional verbatim aliases. */
function stripUndefined<T extends object>(value: T | undefined): Partial<T> {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

function prepareFiles(
  def: Record<string, unknown>,
  declared: OperationDefinition | undefined,
  requestKeys: ReturnType<typeof prepareLayers>["requestKeys"],
  where?: string,
): Pick<
  PreparedOperation,
  "dataFormat" | "multipart" | "fileFields" | "fileRules" | "maxResponseSize" | "responseAccept"
> {
  const wire = (field: string) => (requestKeys ? convertKey(field, requestKeys) : field);
  const config = def.fileFields as readonly string[] | Record<string, FileFieldOptions> | undefined;
  const fields = config === undefined ? [] : Array.isArray(config) ? config : Object.keys(config);
  const aliases = new Map<string, string>();
  if (config !== undefined && !Array.isArray(config)) {
    for (const [field, options] of Object.entries(config as Record<string, FileFieldOptions>)) {
      if (options?.name !== undefined) aliases.set(wire(field), options.name);
    }
  }
  const layers = [def.multipart, declared?.multipart] as Array<MultipartOptions | undefined>;
  const merged = { ...layers[0], ...layers[1] };
  const multipart: MultipartRuntime = {
    options: {
      nulls: merged.nulls ?? DEFAULT_MULTIPART.options.nulls,
      arrays: merged.arrays ?? DEFAULT_MULTIPART.options.arrays,
    },
    aliases,
    jsonFields: new Set((merged.jsonFields ?? []).map(wire)),
  };
  // Opt-in file rules: `undefined` unless something is configured, so unconfigured calls pay nothing.
  const resourceConfig = (config !== undefined && !Array.isArray(config) ? config : {}) as Record<
    string,
    FileFieldOptions
  >;
  const overrides = declared?.fileFields ?? {};
  for (const field of Object.keys(overrides)) {
    if (!(field in resourceConfig) && !fields.includes(field)) {
      throw new ConfigError(
        `${where ?? "operation"}.fileFields.${field}: "${field}" is not declared in the resource's fileFields.`,
      );
    }
  }
  const resolved = new Map<string, ResolvedFieldRules>();
  const partNames = new Map<string, string>();
  for (const field of fields) {
    const wireName = wire(field);
    partNames.set(wireName, wireName);
    const alias = aliases.get(wireName);
    if (alias !== undefined) partNames.set(alias, wireName);
    const rules = resolveFieldRules(wireName, [resourceConfig[field], overrides[field]]);
    if (rules) resolved.set(wireName, rules);
  }
  const limits = {
    ...(def.fileLimits as FileLimits | undefined),
    ...stripUndefined(declared?.fileLimits),
  };
  const hasLimits = Object.values(limits).some((v) => v !== undefined);
  const maxResponseSize = declared?.maxResponseSize;
  return {
    dataFormat: declared?.dataFormat,
    multipart,
    fileFields: fields.length > 0 ? fields.map(wire) : undefined,
    fileRules: resolved.size > 0 || hasLimits ? { fields: resolved, partNames, limits } : undefined,
    maxResponseSize,
    responseAccept: resolveResponseAccept(declared?.responseAccept),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toArray(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && Array.isArray((result as { data?: unknown }).data)) {
    return (result as { data: unknown[] }).data;
  }
  return [];
}

function splitTrailing(args: unknown[], hasResourceParams: boolean, fixed: number) {
  const params = hasResourceParams ? (args[fixed] as PathParams | undefined) : undefined;
  const options = args[hasResourceParams ? fixed + 1 : fixed] as RequestOptions | undefined;
  return { params, options };
}

export interface ResourceBuildInput {
  name: string;
  definition: Record<string, unknown> & { path: string };
  root: LayerOptions;
}

/**
 * Build one resource client: operation selection, defaults, layers, and request strategies are
 * resolved here exactly once; the returned functions only bind call arguments.
 */
export function createResourceClient(client: ClientRuntime, input: ResourceBuildInput) {
  const { name, definition: def, root } = input;
  const resourcePath = def.path;
  const resourceLayer = def as LayerOptions;
  const runtime: ResourceRuntime = {
    name,
    path: resourcePath,
    pagination: def.pagination as ResourceRuntime["pagination"],
  };
  if (def.mock !== undefined) {
    const source = normalizeMockSource(name, def.mock);
    runtime.mock = { source, store: new MockStore(source), files: client.files };
  }
  const slice = def.slice as ResourceSlice | undefined;
  const resourceParamNames = extractPathParamNames(resourcePath);
  const hasResourceParams = resourceParamNames.length > 0;

  const operations = expandOperations(
    def.operations as Record<string, OperationInput> | undefined,
    {
      defaultOperations: def.defaultOperations as boolean | undefined,
      readOnly: def.readOnly as boolean | undefined,
      writeOnly: def.writeOnly as boolean | undefined,
      operationGroups: def.operationGroups as Record<string, boolean> | undefined,
    },
  );

  const out: Record<string, Fn> = {};
  const metadata: Record<string, OperationMetadata> = {};
  const generators: Record<string, () => string> = {};
  for (const [opName, definition] of Object.entries(operations)) {
    const where = `resources.${name}.operations.${opName}`;
    const convention = isBuiltinName(opName) ? BUILTIN_CONVENTIONS[opName] : undefined;
    const fn =
      typeof definition === "function"
        ? definition
        : isRunDefinition(definition)
          ? definition.run
          : undefined;
    if (fn) {
      out[opName] = functionOperation(
        client,
        runtime,
        opName,
        fn,
        convention?.access ?? (definition as OperationRunDefinition).kind!,
        prepareLayers(where, [root, resourceLayer]),
        def,
      );
      metadata[opName] = Object.freeze({
        kind: convention?.access ?? (definition as OperationRunDefinition).kind!,
        builtin: convention !== undefined,
        implementation: "function",
        optionsIndex: null,
        idempotency: false,
      });
      continue;
    }
    const declared = definition as OperationDefinition;
    const method = declared.method ?? convention!.method;
    const relativePath = declared.path ?? convention?.path ?? "";
    const hasBody =
      declared.hasBody ??
      (convention && "hasBody" in convention ? convention.hasBody : undefined) ??
      (convention && "strategy" in convention ? false : BODY_METHODS.has(method));
    const op: PreparedOperation = {
      name: opName,
      method,
      path: joinPath(resourcePath, relativePath),
      relativePath,
      hasBody,
      ...prepareLayers(where, [root, resourceLayer, declared]),
    };
    Object.assign(op, prepareFiles(def, declared, op.requestKeys, where));
    if (declared.responseType !== undefined) op.responseType = declared.responseType;
    if (declared.onTransfer !== undefined) op.onTransfer = declared.onTransfer;
    if (declared.mock !== undefined) {
      op.mockHandler = declared.mock as PreparedOperation["mockHandler"];
    }
    if (declared.idempotency !== undefined && declared.idempotency !== false) {
      const config = declared.idempotency === true ? {} : declared.idempotency;
      op.idempotency = {
        header: config.header ?? "Idempotency-Key",
        generate: config.generate ?? defaultIdempotencyKey,
      };
      generators[opName] = op.idempotency.generate;
    }
    if (convention && "strategy" in convention && hasBody) {
      throw new ConfigError(
        `${where}: hasBody is unsupported on ${opName} (it has no body mapping).`,
      );
    }
    metadata[opName] = Object.freeze({
      kind: convention?.access ?? declared.kind!,
      builtin: convention !== undefined,
      implementation: "request",
      optionsIndex: optionsIndexOf(opName, op, hasResourceParams),
      idempotency: op.idempotency !== undefined,
    });
    const run = (call: CallInput) => runOperation(client, runtime, op, call);
    out[opName] = convention
      ? builtinOperation(opName as BuiltinConventionName, op, run, {
          resourceParamNames,
          hasResourceParams,
          slice,
        })
      : declarativeOperation(op, run);
  }

  Object.defineProperty(out, OPERATION_METADATA, { value: Object.freeze(metadata) });
  if (Object.keys(generators).length > 0)
    registerIdempotencyGenerators(out, Object.freeze(generators));
  return { client: out, store: runtime.mock?.store };
}

const defaultIdempotencyKey = () => randomUUID();

function isRunDefinition(value: unknown): value is OperationRunDefinition {
  return isRecord(value) && typeof value.run === "function";
}

/** Mirrors the argument layouts below: special builtins take resource params after their own. */
function optionsIndexOf(name: string, op: PreparedOperation, hasResourceParams: boolean): number {
  const params = hasResourceParams ? 1 : 0;
  if (name === "exists" || name === "getMany" || name === "findFirst") return 1 + params;
  if (name === "getBy") return 2 + params;
  return (extractPathParamNames(op.path).length > 0 ? 1 : 0) + (op.hasBody ? 1 : 0);
}

interface BuiltinContext {
  resourceParamNames: string[];
  hasResourceParams: boolean;
  slice?: ResourceSlice;
}

/** A declarative custom operation: `(params?, body?, options?)` by its path and method. */
function declarativeOperation(
  op: PreparedOperation,
  run: (call: CallInput) => Promise<unknown>,
): Fn {
  const paramNames = extractPathParamNames(op.path);
  return (...args) => {
    const parsed = parseOperationArgs(paramNames, op.hasBody, args);
    return run({ params: parsed.params, body: parsed.body, options: parsed.options });
  };
}

/**
 * Every builtin builds its own request (HTTP) and its own store intent (mock). None calls
 * another public operation, so disabling or overriding one never changes another.
 */
function builtinOperation(
  name: BuiltinConventionName,
  op: PreparedOperation,
  run: (call: CallInput) => Promise<unknown>,
  ctx: BuiltinContext,
): Fn {
  const paramNames = extractPathParamNames(op.path);
  const idParam = paramNames.find((p) => !ctx.resourceParamNames.includes(p));
  const keyName = (field: string) => (op.requestKeys ? convertKey(field, op.requestKeys) : field);

  switch (name) {
    case "exists":
      return (id, ...rest) => {
        const { params, options } = splitTrailing(rest, ctx.hasResourceParams, 0);
        return run({
          params: { ...params, ...(idParam ? { [idParam]: id as string | number } : {}) },
          query: idParam
            ? options?.query
            : { ...(options?.query ?? {}), id: id as string | number },
          options,
          allow404: true,
          fromHttp: (_data, status) => status !== 404,
          intent: () => ({ op: "exists", id }),
        });
      };
    case "getMany":
      return (ids, ...rest) => {
        const { params, options } = splitTrailing(rest, ctx.hasResourceParams, 0);
        return run({
          params,
          query: { ...(options?.query ?? {}), id: ids as Array<string | number> },
          options,
          fromHttp: toArray,
          intent: () => ({ op: "getMany", ids }),
        });
      };
    case "findFirst":
      return (query, ...rest) => {
        const { params, options } = splitTrailing(rest, ctx.hasResourceParams, 0);
        return run({
          params,
          query: query as QueryParams | undefined,
          options,
          fromHttp: (data) => toArray(data)[0] ?? null,
          intent: (wire) => ({ op: "findFirst", query: wire.query }),
        });
      };
    case "getBy":
      return (fieldOrPath, value, ...rest) => {
        const { params, options } = splitTrailing(rest, ctx.hasResourceParams, 0);
        const field = String(fieldOrPath);
        const encoded = encodeURIComponent(String(value));
        let path: string;
        if (/:field\b|:value\b/.test(op.path)) {
          path = op.path
            .replace(/:field\b/g, encodeURIComponent(field))
            .replace(/:value\b/g, encoded);
        } else {
          const dynamic = /:[A-Za-z0-9_]+/.test(field)
            ? field.replace(/:[A-Za-z0-9_]+/, encoded)
            : joinPath(field, encoded);
          path = joinPath(op.path, dynamic);
        }
        return run({
          params,
          path,
          options,
          intent: () => ({ op: "getBy", field: keyName(field), value }),
        });
      };
    default:
      break;
  }

  return (...args) => {
    const parsed = parseOperationArgs(paramNames, op.hasBody, args);
    const params = parsed.params;
    const id = idParam ? params?.[idParam] : undefined;
    const call: CallInput = { params, body: parsed.body, options: parsed.options };
    call.intent = (wire): BuiltinIntent => {
      switch (name) {
        case "getAll":
        case "count":
        case "search":
          // A body-carrying override (e.g. `search: { method: "POST" }`) sends its filter as the body.
          return { op: name, query: wire.query ?? (isRecord(wire.body) ? wire.body : undefined) };
        case "getBySlug":
          return { op: name, slug: id };
        case "getById":
        case "delete":
          return { op: name, id };
        case "update":
        case "patch":
        case "upsert":
          return { op: name, id, body: wire.body };
        default:
          return { op: name, body: wire.body };
      }
    };
    if (name === "getAll" && ctx.slice !== undefined) {
      const slice = ctx.slice;
      call.shape = (data: unknown) => applyResourceSliceToListResult(data, slice);
    }
    return run(call);
  };
}

/** Custom function operation: `ctx.request()` goes through the same lifecycle (and mock scope). */
function functionOperation(
  client: ClientRuntime,
  runtime: ResourceRuntime,
  opName: string,
  fn: OperationFn,
  kind: "read" | "write",
  layers: ReturnType<typeof prepareLayers>,
  def: Record<string, unknown>,
): Fn {
  const base: PreparedOperation = {
    name: opName,
    method: "GET",
    path: runtime.path,
    relativePath: "",
    hasBody: false,
    ...layers,
    ...prepareFiles(def, undefined, layers.requestKeys),
  };
  const ctx: OperationFnContext = {
    resource: runtime.name,
    operation: opName,
    request: <T>(init: OperationFnRequestInit = {}) => {
      const method = init.method ?? "GET";
      validateMethodKind(`resources.${runtime.name}.operations.${opName}`, kind, method);
      const options: RequestOptions = {
        headers: init.headers,
        signal: init.signal,
        timeout: init.timeout,
        retry: init.retry,
        responseType: init.responseType,
        onTransfer: init.onTransfer,
        meta: init.meta,
        full: init.full,
      };
      return runOperation(client, runtime, base, {
        method,
        path: joinPath(runtime.path, init.path ?? ""),
        relativePath: init.path ?? "",
        params: init.params,
        query: init.query,
        body: init.body,
        dataFormat: init.dataFormat,
        hasBody: init.body !== undefined,
        routed: true,
        options,
      }) as Promise<T>;
    },
  };
  return (...args) => Promise.resolve().then(() => fn(ctx, ...args));
}
