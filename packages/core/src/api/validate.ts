import { ConfigError } from "../errors/index.js";
import { BUILTIN_CONVENTIONS, isBuiltinName } from "../operation/conventions.js";
import { resolveRetryConfig } from "../request/retry.js";
import { isResponseType, RESPONSE_TYPES } from "../transport/read-body.js";
import { isKeyCase, KEY_CASES } from "../transform/keys.js";
import type { HttpMethod } from "../types/http.js";
import type {
  MiddlewareHooks,
  RequestMiddleware,
  ResponseMiddleware,
} from "../types/middleware.js";
import type { TransformsConfig } from "../types/transform.js";
import { assertResourceSlice } from "../utils/slice.js";

/**
 * Construction-time validation. Everything TypeScript cannot prove (dynamic spreads, untyped
 * JS callers) is rejected here with the offending option named — never on a later request.
 */

export const ROOT_KEYS = new Set([
  "baseURL",
  "headers",
  "transport",
  "timeout",
  "retry",
  "middleware",
  "requestMiddleware",
  "responseMiddleware",
  "transforms",
  "queryArrayFormat",
  "querySerializer",
  "resources",
]);

export const RESOURCE_KEYS = new Set([
  "path",
  "headers",
  "timeout",
  "retry",
  "middleware",
  "requestMiddleware",
  "responseMiddleware",
  "transforms",
  "defaultOperations",
  "readOnly",
  "writeOnly",
  "operationGroups",
  "operations",
  "mock",
  "pagination",
  "slice",
  "fileFields",
  "multipart",
]);

export const OPERATION_KEYS = new Set([
  "kind",
  "idempotency",
  "method",
  "path",
  "hasBody",
  "headers",
  "timeout",
  "retry",
  "middleware",
  "requestMiddleware",
  "responseMiddleware",
  "transforms",
  "mock",
  "dataFormat",
  "multipart",
  "responseType",
  "onTransfer",
]);

const RUN_KEYS = new Set(["kind", "run"]);

const METHODS = new Set<HttpMethod>(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
export function requiredKind(method: HttpMethod): "read" | "write" {
  return method === "GET" || method === "HEAD" || method === "OPTIONS" ? "read" : "write";
}

export function validateMethodKind(
  where: string,
  kind: "read" | "write",
  method: HttpMethod,
): void {
  if (!METHODS.has(method)) {
    throw new ConfigError(
      `${where}: HTTP method "${String(method)}" is invalid. Use GET, HEAD, OPTIONS, POST, PUT, PATCH, or DELETE.`,
    );
  }
  const required = requiredKind(method);
  if (kind !== required) {
    throw new ConfigError(
      `${where}: Operation kind "${kind}" is incompatible with HTTP method "${method}". ${method} requires kind "${required}". Change the method or kind.`,
    );
  }
}
const GROUPS = new Set(["read", "write", "many", "extended"]);
const HOOK_KEYS = new Set(["onRequest", "onResponse", "onError"]);

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function typeName(value: unknown): string {
  return Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
}

function unknownKey(where: string, key: string, allowed: Set<string>): never {
  throw new ConfigError(
    `${where} has unknown option "${key}". Supported: ${[...allowed].join(", ")}.`,
  );
}

export function assertKnownKeys(
  where: string,
  value: Record<string, unknown>,
  allowed: Set<string>,
): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) unknownKey(where, key, allowed);
}

export function validateRoot(
  config: unknown,
): asserts config is Record<string, unknown> & { resources: Record<string, unknown> } {
  if (!isPlainObject(config)) {
    throw new ConfigError(`defineApi() expects a config object (got ${typeName(config)}).`);
  }
  for (const key of Object.keys(config)) {
    if (ROOT_KEYS.has(key)) continue;
    const value = config[key];
    if (isPlainObject(value) && "path" in value) {
      throw new ConfigError(
        `"${key}" looks like a resource at the root of the config. Resources must be nested: ` +
          `defineApi({ baseURL, resources: { ${key}: { path: ${JSON.stringify(value.path)} } } }).`,
      );
    }
    unknownKey("defineApi config", key, ROOT_KEYS);
  }
  if (!("resources" in config)) {
    throw new ConfigError(
      `defineApi config needs a "resources" object, e.g. resources: { users: { path: "/users" } }.`,
    );
  }
  if (!isPlainObject(config.resources)) {
    throw new ConfigError(
      `"resources" must be an object of resource definitions (got ${typeName(config.resources)}).`,
    );
  }
  if (config.transport !== undefined) {
    const transport = config.transport as { request?: unknown } | null;
    if (!transport || typeof transport !== "object" || typeof transport.request !== "function") {
      throw new ConfigError(`transport must be an object with a request(input) function.`);
    }
  }
  if (
    config.queryArrayFormat !== undefined &&
    !["repeat", "comma", "brackets"].includes(config.queryArrayFormat as string)
  ) {
    throw new ConfigError(
      `queryArrayFormat must be "repeat", "comma", or "brackets" (got ${String(config.queryArrayFormat)}).`,
    );
  }
  if (config.querySerializer !== undefined && typeof config.querySerializer !== "function") {
    throw new ConfigError(`querySerializer must be a function.`);
  }
  validateLayer("defineApi config", config);
}

/** Options shared by root, resource, and operation levels. */
export function validateLayer(where: string, layer: Record<string, unknown>): void {
  const { headers, timeout, retry, middleware, requestMiddleware, responseMiddleware, transforms } =
    layer;
  resolveRetryConfig(retry as never, `${where}.retry`);
  if (headers !== undefined && typeof headers !== "function" && typeof headers !== "object") {
    throw new ConfigError(
      `${where}.headers must be an object, Headers, entries array, or a (sync/async) function.`,
    );
  }
  if (headers === null) throw new ConfigError(`${where}.headers must not be null.`);
  if (
    timeout !== undefined &&
    (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout < 0)
  ) {
    throw new ConfigError(
      `${where}.timeout must be a non-negative number of milliseconds (got ${String(timeout)}).`,
    );
  }
  if (middleware !== undefined) validateHooks(`${where}.middleware`, middleware);
  if (requestMiddleware !== undefined)
    validateFnArray(`${where}.requestMiddleware`, requestMiddleware);
  if (responseMiddleware !== undefined)
    validateFnArray(`${where}.responseMiddleware`, responseMiddleware);
  if (transforms !== undefined) validateTransforms(`${where}.transforms`, transforms);
}

function validateHooks(where: string, value: unknown): asserts value is MiddlewareHooks {
  if (Array.isArray(value)) {
    throw new ConfigError(
      `${where} must be an object { onRequest?, onResponse?, onError? }. ` +
        `Around-style middleware arrays were removed; use requestMiddleware / responseMiddleware arrays instead.`,
    );
  }
  if (!isPlainObject(value))
    throw new ConfigError(`${where} must be an object { onRequest?, onResponse?, onError? }.`);
  for (const [key, hook] of Object.entries(value)) {
    if (!HOOK_KEYS.has(key)) unknownKey(where, key, HOOK_KEYS);
    if (hook !== undefined && typeof hook !== "function")
      throw new ConfigError(`${where}.${key} must be a function.`);
  }
}

function validateFnArray(
  where: string,
  value: unknown,
): asserts value is Array<RequestMiddleware | ResponseMiddleware> {
  if (!Array.isArray(value)) throw new ConfigError(`${where} must be an array of functions.`);
  value.forEach((fn, i) => {
    if (typeof fn !== "function")
      throw new ConfigError(`${where}[${i}] must be a function (got ${typeName(fn)}).`);
  });
}

function validateTransforms(where: string, value: unknown): asserts value is TransformsConfig {
  if (!isPlainObject(value))
    throw new ConfigError(`${where} must be { request?: { keys }, response?: { keys } }.`);
  for (const [direction, rule] of Object.entries(value)) {
    if (direction !== "request" && direction !== "response")
      unknownKey(where, direction, new Set(["request", "response"]));
    if (rule === undefined) continue;
    if (!isPlainObject(rule)) throw new ConfigError(`${where}.${direction} must be { keys }.`);
    assertKnownKeys(`${where}.${direction}`, rule, new Set(["keys"]));
    if (!isKeyCase(rule.keys)) {
      throw new ConfigError(
        `${where}.${direction}.keys must be one of ${KEY_CASES.join(", ")} (got ${JSON.stringify(rule.keys)}).`,
      );
    }
  }
}

export function validateResource(
  name: string,
  value: unknown,
): asserts value is Record<string, unknown> & { path: string } {
  const where = `resources.${name}`;
  if (!isPlainObject(value))
    throw new ConfigError(`${where} must be a resource object like { path: "/${name}" }.`);
  assertKnownKeys(where, value, RESOURCE_KEYS);
  if (typeof value.path !== "string" || !value.path.startsWith("/")) {
    throw new ConfigError(`${where}.path must be a string starting with "/" (e.g. "/${name}").`);
  }
  for (const flag of ["defaultOperations", "readOnly", "writeOnly"] as const) {
    if (value[flag] !== undefined && typeof value[flag] !== "boolean") {
      throw new ConfigError(`${where}.${flag} must be a boolean.`);
    }
  }
  if (value.readOnly === true && value.writeOnly === true) {
    throw new ConfigError(`${where} cannot set both readOnly and writeOnly to true.`);
  }
  if (value.operationGroups !== undefined) {
    if (!isPlainObject(value.operationGroups))
      throw new ConfigError(`${where}.operationGroups must be an object.`);
    for (const [group, choice] of Object.entries(value.operationGroups)) {
      if (!GROUPS.has(group)) unknownKey(`${where}.operationGroups`, group, GROUPS);
      if (choice !== undefined && typeof choice !== "boolean") {
        throw new ConfigError(`${where}.operationGroups.${group} must be a boolean.`);
      }
    }
  }
  if (
    value.pagination !== undefined &&
    value.pagination !== "page" &&
    value.pagination !== "cursor"
  ) {
    throw new ConfigError(
      `${where}.pagination must be "page" or "cursor" (got ${JSON.stringify(value.pagination)}).` +
        (typeof value.pagination === "boolean"
          ? ` The mock pagination boolean was replaced by pagination: "page".`
          : ""),
    );
  }
  if (value.slice !== undefined) {
    try {
      assertResourceSlice(value.slice, `${where}.slice`);
    } catch (cause) {
      throw new ConfigError((cause as Error).message, { cause });
    }
  }
  validateFileFields(where, value.fileFields);
  validateMultipart(where, value.multipart);
  validateLayer(where, value);
  if (value.operations !== undefined) {
    if (!isPlainObject(value.operations))
      throw new ConfigError(`${where}.operations must be an object.`);
    for (const [op, definition] of Object.entries(value.operations))
      validateOperation(`${where}.operations.${op}`, op, definition);
  }
}

function validateOperation(where: string, name: string, value: unknown): void {
  const builtin = isBuiltinName(name);
  if (value === undefined || value === false) return;
  if (typeof value === "function") {
    if (!builtin)
      throw new ConfigError(
        `${where}: custom function operation requires { kind: "read" | "write", run }.`,
      );
    return;
  }
  if (value === true) {
    if (!builtin) {
      throw new ConfigError(
        `${where}: true cannot create custom operation "${name}"; give it { method, path } or a function.`,
      );
    }
    return;
  }
  if (!isPlainObject(value)) {
    throw new ConfigError(
      `${where} must be true, false, a config object, or a function (got ${typeName(value)}).`,
    );
  }
  if (builtin && "kind" in value) {
    throw new ConfigError(
      `${where}.kind: builtin "${name}" is always "${BUILTIN_CONVENTIONS[name].access}"; kind is for custom operations.`,
    );
  }
  if (!builtin) {
    if (value.kind !== "read" && value.kind !== "write")
      throw new ConfigError(
        `${where}.kind must be explicitly set to "read" or "write" (got ${JSON.stringify(value.kind)}).`,
      );
  }
  if ("run" in value) {
    assertKnownKeys(where, value, RUN_KEYS);
    if (typeof value.run !== "function")
      throw new ConfigError(`${where}.run must be a function (got ${typeName(value.run)}).`);
    return;
  }
  assertKnownKeys(where, value, OPERATION_KEYS);
  if (value.mock !== undefined) {
    if (builtin) {
      throw new ConfigError(
        `${where}.mock: builtin "${name}" is simulated by Core; \`mock\` is for custom operations.`,
      );
    }
    if (typeof value.mock !== "function") {
      throw new ConfigError(
        `${where}.mock must be a function ({ records, store, params, query, body, signal }) => result (got ${typeName(value.mock)}).`,
      );
    }
  }
  if (value.method !== undefined && !METHODS.has(value.method as HttpMethod)) {
    throw new ConfigError(
      `${where}.method must be one of ${[...METHODS].join(", ")} (got ${JSON.stringify(value.method)}).`,
    );
  }
  if (!builtin && value.method === undefined) {
    throw new ConfigError(`${where}: custom operation "${name}" needs a method.`);
  }
  const method = (value.method ??
    (builtin ? BUILTIN_CONVENTIONS[name].method : undefined)) as HttpMethod;
  validateMethodKind(
    where,
    builtin ? BUILTIN_CONVENTIONS[name].access : (value.kind as "read" | "write"),
    method,
  );
  if (value.path !== undefined && typeof value.path !== "string")
    throw new ConfigError(`${where}.path must be a string.`);
  if (value.hasBody !== undefined && typeof value.hasBody !== "boolean")
    throw new ConfigError(`${where}.hasBody must be a boolean.`);
  validateIdempotency(
    where,
    value.idempotency,
    builtin ? BUILTIN_CONVENTIONS[name].access : (value.kind as "read" | "write"),
  );
  if (value.onTransfer !== undefined && typeof value.onTransfer !== "function") {
    throw new ConfigError(
      `${where}.onTransfer must be a function (got ${typeName(value.onTransfer)}).`,
    );
  }
  if (value.responseType !== undefined && !isResponseType(value.responseType)) {
    throw new ConfigError(
      `${where}.responseType must be one of ${RESPONSE_TYPES.map((t) => JSON.stringify(t)).join(", ")} (got ${
        typeof value.responseType === "string"
          ? JSON.stringify(value.responseType)
          : typeName(value.responseType)
      }).`,
    );
  }
  if (value.dataFormat !== undefined) {
    if (value.dataFormat !== "json" && value.dataFormat !== "multipart") {
      throw new ConfigError(
        `${where}.dataFormat must be "json" or "multipart" (got ${JSON.stringify(value.dataFormat)}).`,
      );
    }
    const kind = builtin ? BUILTIN_CONVENTIONS[name].access : value.kind;
    if (kind !== "write") {
      throw new ConfigError(`${where}.dataFormat: only write operations have a body to encode.`);
    }
  }
  validateMultipart(where, value.multipart);
  validateLayer(where, value);
}

const FILE_FIELD_KEYS = new Set(["name"]);
const MULTIPART_KEYS = new Set(["jsonFields", "nulls", "arrays"]);
const UNSAFE_FIELD_NAMES = new Set(["__proto__", "constructor", "prototype"]);

function validateFileFields(where: string, value: unknown): void {
  if (value === undefined) return;
  const at = `${where}.fileFields`;
  const names: string[] = [];
  if (Array.isArray(value)) {
    names.push(...(value as unknown[]).map((n) => (typeof n === "string" ? n : "")));
    if (names.some((n) => n === "")) {
      throw new ConfigError(`${at} must list non-empty field names (strings).`);
    }
  } else if (isPlainObject(value)) {
    for (const [field, options] of Object.entries(value)) {
      names.push(field);
      if (options === undefined) continue;
      if (!isPlainObject(options)) {
        throw new ConfigError(`${at}.${field} must be an options object like { name: "..." }.`);
      }
      assertKnownKeys(`${at}.${field}`, options, FILE_FIELD_KEYS);
      if (options.name !== undefined && (typeof options.name !== "string" || options.name === "")) {
        throw new ConfigError(`${at}.${field}.name must be a non-empty string.`);
      }
    }
  } else {
    throw new ConfigError(
      `${at} must be an array of field names or an object like { avatar: { name } } (got ${typeName(value)}).`,
    );
  }
  if (names.length === 0) throw new ConfigError(`${at} must declare at least one field.`);
  if (new Set(names).size !== names.length) {
    throw new ConfigError(`${at} lists a field more than once.`);
  }
  const unsafe = names.find((n) => UNSAFE_FIELD_NAMES.has(n));
  if (unsafe !== undefined) throw new ConfigError(`${at} must not contain "${unsafe}".`);
}

function validateMultipart(where: string, value: unknown): void {
  if (value === undefined) return;
  const at = `${where}.multipart`;
  if (!isPlainObject(value)) {
    throw new ConfigError(
      `${at} must be { jsonFields?, nulls?, arrays? } (got ${typeName(value)}).`,
    );
  }
  assertKnownKeys(at, value, MULTIPART_KEYS);
  if (
    value.jsonFields !== undefined &&
    (!Array.isArray(value.jsonFields) ||
      value.jsonFields.some((f) => typeof f !== "string" || f === ""))
  ) {
    throw new ConfigError(`${at}.jsonFields must be an array of non-empty field names.`);
  }
  if (value.nulls !== undefined && value.nulls !== "empty" && value.nulls !== "omit") {
    throw new ConfigError(
      `${at}.nulls must be "empty" or "omit" (got ${JSON.stringify(value.nulls)}).`,
    );
  }
  if (
    value.arrays !== undefined &&
    value.arrays !== "brackets" &&
    value.arrays !== "indices" &&
    value.arrays !== "repeat"
  ) {
    throw new ConfigError(
      `${at}.arrays must be "brackets", "indices" or "repeat" (got ${JSON.stringify(value.arrays)}).`,
    );
  }
}

const IDEMPOTENCY_KEYS = new Set(["header", "generate"]);

function validateIdempotency(where: string, value: unknown, kind: "read" | "write"): void {
  if (value === undefined || value === false) return;
  if (kind !== "write") {
    throw new ConfigError(
      `${where}.idempotency: only write operations send an idempotency key (this operation is a "${kind}").`,
    );
  }
  if (value === true) return;
  if (!isPlainObject(value)) {
    throw new ConfigError(
      `${where}.idempotency must be true, false, or { header?, generate? } (got ${typeName(value)}).`,
    );
  }
  assertKnownKeys(`${where}.idempotency`, value, IDEMPOTENCY_KEYS);
  if (
    value.header !== undefined &&
    (typeof value.header !== "string" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value.header))
  ) {
    throw new ConfigError(`${where}.idempotency.header must be a valid HTTP header name.`);
  }
  if (value.generate !== undefined && typeof value.generate !== "function") {
    throw new ConfigError(`${where}.idempotency.generate must be a function.`);
  }
}
