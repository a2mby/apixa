import { attachMockFiles } from "../mock/transaction.js";
import { ConfigError, ResponseShapeError, ValidationError } from "../errors/index.js";
import { extractPathParamNames, joinPath } from "../http/path.js";
import { MockStore, normalizeMockSource, type BuiltinIntent } from "../mock/index.js";
import { DEFAULT_MULTIPART, type MultipartRuntime } from "../http/multipart.js";
import { BUILTIN_CONVENTIONS, expandOperations, isBuiltinName } from "../operation/index.js";
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
import { requiredKind, validateMethodKind } from "./validate.js";
import type {
  FileFieldOptions,
  FileLimits,
  LayerOptions,
  MultipartOptions,
  OperationDefinition,
  OperationRunDefinition,
  OperationSelection,
  ResourcePagination,
} from "../types/definition.js";
import { resolveOperationPagination, resolvePagination } from "./pagination.js";
import {
  OPERATION_METADATA,
  registerIdempotencyGenerators,
  type OperationMetadata,
} from "./metadata.js";
import type { HeadersSource } from "../types/http.js";
import type { RetryOption } from "../types/retry.js";
import type { ApiResponse, RequestOptions } from "../types/transport.js";
import { randomUUID } from "../utils/uuid.js";
import { applyResourceSliceToListResult, type ResourceSlice } from "../utils/slice.js";

type Fn = (...args: unknown[]) => Promise<unknown>;

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Most specific defined value wins; `false` retry at a lower level disables inherited retry. */
function pick<T>(...values: Array<T | undefined>): T | undefined {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] !== undefined) return values[i];
  return undefined;
}

/** Merge root → resource → operation layers once, at construction. */
function prepareLayers(where: string, layers: Array<LayerOptions | undefined>) {
  const present = layers.filter((l): l is LayerOptions => l !== undefined);
  const retry = pick<RetryOption>(...present.map((l) => l.retry));
  const hooks = present.flatMap((layer) => layer.middleware ?? []);
  const rawUnwrap = pick(...present.map((l) => l.response?.unwrap));
  const rawParse = pick(...present.map((l) => l.response?.parse));
  const rawValidate = pick(...present.map((l) => l.response?.validate));
  return {
    headers: present.map((l) => l.headers).filter((h): h is HeadersSource => h !== undefined),
    timeout: pick(...present.map((l) => l.timeout)),
    retry: resolveRetryConfig(retry, `${where}.retry`),
    onRequest: hooks.flatMap((entry) => (entry.onRequest ? [entry.onRequest] : [])),
    onResponse: hooks.flatMap((entry) => (entry.onResponse ? [entry.onResponse] : [])),
    onError: hooks.flatMap((entry) => (entry.onError ? [entry.onError] : [])),
    requestTransform: pick(...present.map((l) => l.transforms?.request)),
    responseTransform: pick(...present.map((l) => l.transforms?.response)),
    responseUnwrap: rawUnwrap === false ? undefined : rawUnwrap,
    responseParse: rawParse === false ? undefined : rawParse,
    responseValidate: rawValidate === false ? undefined : rawValidate,
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
  requestKeys: import("../transform/keys.js").KeyCase | undefined,
  where?: string,
): Pick<
  PreparedOperation,
  | "dataFormat"
  | "multipart"
  | "fileFields"
  | "fileRules"
  | "maxResponseSize"
  | "redirectOrigins"
  | "responseAccept"
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
    redirectOrigins: declared?.redirectOrigins,
    responseAccept: resolveResponseAccept(declared?.responseAccept),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toArray(result: unknown, response: ApiResponse<unknown>): unknown[] {
  if (Array.isArray(result)) return result;
  throw new ResponseShapeError(
    `${response.request.resource}.${response.request.operation}: expected an array response.`,
    { status: response.status, data: response.data, response },
  );
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
  };
  const livePagination = resolvePagination(name, def.pagination as ResourcePagination | undefined);
  if (livePagination) {
    runtime.pagination = livePagination.mode;
    runtime.livePagination = livePagination;
  }
  if (def.mock !== undefined) {
    const source = normalizeMockSource(name, def.mock, def.idKey as string | undefined);
    runtime.mock = { source, store: new MockStore(source), files: client.files };
    const seedFiles = prepareFiles(
      def,
      undefined,
      prepareLayers(name, [root, resourceLayer]).requestTransform?.keys,
    );
    attachMockFiles(
      runtime.mock.store,
      source,
      client.files,
      name,
      seedFiles.fileFields ?? [],
      seedFiles.fileRules,
    );
  }
  const slice = def.slice as ResourceSlice | undefined;
  const resourceParamNames = extractPathParamNames(resourcePath);

  const operations = expandOperations(
    def.operations as Record<string, OperationInput> | OperationSelection | undefined,
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
        typeof definition === "object"
          ? (definition as OperationRunDefinition).presigned
          : undefined,
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
      pagination: resolveOperationPagination(
        name,
        def.pagination as ResourcePagination | undefined,
        opName,
        declared.pagination,
        convention !== undefined,
      ),
      ...prepareLayers(where, [root, resourceLayer, declared]),
    };
    Object.assign(op, prepareFiles(def, declared, op.requestTransform?.keys, where));
    if (declared.transfer !== undefined) {
      op.transfer = declared.transfer;
      if (typeof declared.transfer.source === "string") {
        const fields = def.fileFields;
        if (
          !(Array.isArray(fields)
            ? fields.includes(declared.transfer.source)
            : fields &&
              typeof fields === "object" &&
              Object.hasOwn(fields, declared.transfer.source))
        )
          throw new ConfigError("Transfer source must name a declared file field.");
      }
      op.transferLayers = prepareLayers(where, [root, resourceLayer]);
    }
    if (declared.presigned !== undefined) op.presigned = declared.presigned;
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
      kind: requiredKind(method),
      builtin: convention !== undefined,
      implementation: "request",
      optionsIndex: optionsIndexOf(opName, op),
      idempotency: op.idempotency !== undefined,
    });
    const run = (call: CallInput) => runOperation(client, runtime, op, call);
    out[opName] = convention
      ? builtinOperation(opName as BuiltinConventionName, op, run, {
          resourceParamNames,
          slice,
          idKey: (def.idKey as string | undefined) ?? runtime.mock?.source.idKey ?? "id",
          paginated: op.pagination !== undefined,
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

/** Trailing `RequestOptions` slot index for every request-backed operation. */
function optionsIndexOf(name: string, op: PreparedOperation): number {
  if (!isBuiltinName(name)) return op.hasBody ? 1 : 0;
  if (name === "getBy") return 2;
  if (
    name === "getAll" ||
    name === "findFirst" ||
    name === "count" ||
    name === "create" ||
    name === "createMany" ||
    name === "deleteMany"
  ) {
    return op.hasBody ? 1 : 0;
  }
  return 1; // getById, delete, update, patch, exists, getMany
}

interface BuiltinContext {
  resourceParamNames: string[];
  slice?: ResourceSlice;
  idKey: string;
  /** This operation resolves pagination, so live results map to the page contract. */
  paginated?: boolean;
}

function expectPaginatedRecord(data: unknown, response: ApiResponse<unknown>) {
  if (isRecord(data)) return data;
  throw new ResponseShapeError(
    `${response.request.resource}.${response.request.operation}: expected a paginated object response.`,
    { status: response.status, data: response.data, response },
  );
}

/** A declarative custom operation: body first when needed, then one options object. */
function declarativeOperation(
  op: PreparedOperation,
  run: (call: CallInput) => Promise<unknown>,
): Fn {
  const paginated = op.pagination !== undefined;
  return (...args) => {
    const options = args[op.hasBody ? 1 : 0] as RequestOptions | undefined;
    return run({
      params: options?.params,
      body: op.hasBody ? args[0] : undefined,
      options,
      ...(paginated
        ? {
            paginated: true,
            fromHttp: (data, _status, response) => expectPaginatedRecord(data, response),
          }
        : {}),
    });
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
  const keyName = (field: string) =>
    op.requestTransform ? convertKey(field, op.requestTransform.keys) : field;

  switch (name) {
    case "exists":
      return (id, input) => {
        const options = input as RequestOptions | undefined;
        const params = options?.params;
        return run({
          params: { ...params, ...(idParam ? { [idParam]: id as string | number } : {}) },
          query: idParam
            ? options?.query
            : { ...(options?.query ?? {}), [ctx.idKey]: id as string | number },
          options,
          allow404: true,
          fromHttp: (_data, status) => status !== 404,
          intent: () => ({ op: "exists", id }),
        });
      };
    case "getMany":
      return (ids, input) => {
        const options = input as RequestOptions | undefined;
        const params = options?.params;
        return run({
          params,
          query: { ...(options?.query ?? {}), [ctx.idKey]: ids as Array<string | number> },
          options,
          paginated: ctx.paginated,
          fromHttp: (data, _status, response) =>
            ctx.paginated ? expectPaginatedRecord(data, response) : toArray(data, response),
          intent: (wire) => ({ op: "getMany", ids, query: wire.query }),
        });
      };
    case "findFirst":
      return (input) => {
        const options = input as RequestOptions | undefined;
        return run({
          params: options?.params,
          query: options?.query,
          options,
          fromHttp: (data, _status, response) => toArray(data, response)[0] ?? null,
          intent: (wire) => ({ op: "findFirst", query: wire.query }),
        });
      };
    case "getBy":
      return (fieldOrName, value, input) => {
        const options = input as RequestOptions | undefined;
        const field = String(fieldOrName);
        const wireField = keyName(field);
        const encoded = encodeURIComponent(String(value));
        const hasTemplate = /:field\b|:value\b/.test(op.path);
        const path = hasTemplate
          ? op.path
              .replace(/:field\b/g, encodeURIComponent(wireField))
              .replace(/:value\b/g, encoded)
          : undefined;
        return run({
          params: options?.params,
          ...(path !== undefined ? { path } : {}),
          query: hasTemplate
            ? options?.query
            : { ...(options?.query ?? {}), [wireField]: value as string | number },
          options,
          allow404: true,
          fromHttp: (data, status, response) => {
            if (status === 404 || data === null || data === undefined) return null;
            if (Array.isArray(data)) return data[0] ?? null;
            if (isRecord(data)) return data;
            throw new ResponseShapeError(
              `${response.request.resource}.${response.request.operation}: expected an object or array response.`,
              { status: response.status, data: response.data, response },
            );
          },
          intent: () => ({ op: "getBy", field: wireField, value }),
        });
      };
    default:
      break;
  }

  return (...args) => {
    if (
      (name === "update" || name === "patch") &&
      op.hasBody &&
      (!isRecord(args[1]) || !("body" in args[1]))
    ) {
      return Promise.reject(
        new ValidationError(`${name}: the request body is required in options.body.`),
      );
    }
    const isIdentity =
      name === "getById" || name === "delete" || name === "update" || name === "patch";
    let params: RequestOptions["params"];
    let body: unknown;
    let options: RequestOptions | undefined;
    if (isIdentity) {
      options = args[1] as RequestOptions | undefined;
      body = (args[1] as (RequestOptions & { body?: unknown }) | undefined)?.body;
      params = {
        ...options?.params,
        ...(idParam ? { [idParam]: args[0] as string | number } : {}),
      };
    } else {
      body = op.hasBody ? args[0] : undefined;
      options = args[op.hasBody ? 1 : 0] as RequestOptions | undefined;
      params = options?.params;
    }
    const id = idParam ? params?.[idParam] : undefined;
    const call: CallInput = { params, body, options };
    call.intent = (wire): BuiltinIntent => {
      switch (name) {
        case "getAll":
        case "count":
          return { op: name, query: wire.query ?? (isRecord(wire.body) ? wire.body : undefined) };
        case "getById":
        case "delete":
          return { op: name, id };
        case "update":
        case "patch":
          return { op: name, id, body: wire.body };
        default:
          return { op: name, body: wire.body };
      }
    };
    if (name === "getAll") {
      if (ctx.paginated) {
        call.paginated = true;
        call.fromHttp = (data, _status, response) => {
          if (isRecord(data)) return data;
          throw new ResponseShapeError(
            `${response.request.resource}.${response.request.operation}: expected a paginated object response.`,
            { status: response.status, data: response.data, response },
          );
        };
      } else {
        call.fromHttp = (data, _status, response) => {
          if (Array.isArray(data) || isRecord(data)) return data;
          throw new ResponseShapeError(
            `${response.request.resource}.${response.request.operation}: expected an array or object response.`,
            { status: response.status, data: response.data, response },
          );
        };
      }
    } else if (name === "count") {
      call.fromHttp = (data, _status, response) => {
        if (typeof data === "number" && Number.isFinite(data)) return data;
        throw new ResponseShapeError(
          `${response.request.resource}.${response.request.operation}: expected a numeric count response.`,
          { status: response.status, data: response.data, response },
        );
      };
    } else if (name === "createMany") {
      call.fromHttp = (data, _status, response) => toArray(data, response);
    } else if (name === "getById" || name === "create" || name === "update" || name === "patch") {
      call.fromHttp = (data, status, response) => {
        if ((status === 204 || status === 205) && data === null) return null;
        if (isRecord(data)) return data;
        throw new ResponseShapeError(
          `${response.request.resource}.${response.request.operation}: expected an object response.`,
          { status: response.status, data: response.data, response },
        );
      };
    }
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
  presigned?: import("../types/advanced-transfer.js").PresignedPolicy,
): Fn {
  const base: PreparedOperation = {
    presigned,
    name: opName,
    method: "GET",
    path: runtime.path,
    relativePath: "",
    hasBody: false,
    ...layers,
    ...prepareFiles(def, undefined, layers.requestTransform?.keys),
  };
  const ctx: OperationFnContext = {
    transfer: <T, F extends boolean = false>(
      config: import("../types/advanced-transfer.js").AdvancedTransferConfig<T>,
      body: unknown,
      options?: RequestOptions & { full?: F },
    ) => {
      if (kind !== "write")
        return Promise.reject(new ConfigError("Read operations cannot start an upload."));
      return runOperation(
        client,
        runtime,
        { ...base, transfer: config, hasBody: true, method: "POST" },
        { body, options },
      ) as Promise<F extends true ? import("../types/transport.js").ApiResponse<T> : T>;
    },
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
        maxResponseSize: init.maxResponseSize,
        redirectOrigins: init.redirectOrigins,
        presigned: init.presigned,
        onTransfer: init.onTransfer,
        meta: init.meta,
        full: init.full,
      };
      return runOperation(client, runtime, base, {
        method,
        ...(init.presigned ? {} : { path: joinPath(runtime.path, init.path ?? "") }),
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
