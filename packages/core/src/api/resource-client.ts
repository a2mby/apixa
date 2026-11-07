import { ConfigError } from "../errors/index.js";
import { extractPathParamNames, joinPath } from "../http/path.js";
import { MockStore, normalizeMockSource, type BuiltinIntent } from "../mock/index.js";
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
import type { OperationFn, OperationFnContext, OperationFnRequestInit } from "../types/builtins.js";
import { validateMethodKind } from "./validate.js";
import type {
  LayerOptions,
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
    runtime.mock = { source, store: new MockStore(source) };
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

/** `crypto.randomUUID()` (browsers, Node 19+), else a v4 UUID from `getRandomValues`. */
function defaultIdempotencyKey(): string {
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  if (typeof webCrypto?.getRandomValues !== "function") {
    throw new ConfigError("idempotency: no Web Crypto in this runtime; pass idempotency.generate.");
  }
  const bytes = webCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
): Fn {
  const base: PreparedOperation = {
    name: opName,
    method: "GET",
    path: runtime.path,
    relativePath: "",
    hasBody: false,
    ...layers,
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
        hasBody: init.body !== undefined,
        routed: true,
        options,
      }) as Promise<T>;
    },
  };
  return (...args) => Promise.resolve().then(() => fn(ctx, ...args));
}
