import { ConfigError } from "../errors/index.js";
import type { QueryArrayFormat, QueryOptions } from "../types/definition.js";
import { RESPONSE_STAGES, type LayerOptions, type ResponseStage } from "../types/definition.js";
import type { QueryParams } from "../types/http.js";
import type { RetryOption, TimeoutOption } from "../types/retry.js";
import { resolveRetryConfig, resolveTimeout } from "../request/retry.js";
import { validateHooks, validateQueryOptions, validateResponseOptions } from "./validate.js";

/**
 * One scope of advanced settings, already checked and folded into the legacy layer fields.
 * Callers' objects are never written. Resolution happens at client construction.
 */
export interface LayerInput extends LayerOptions {
  responseOrder?: readonly ResponseStage[];
  strict?: boolean;
}

export interface ResolvedSerialization {
  queryArrayFormat?: QueryArrayFormat;
  query?: QueryOptions;
  querySerializer?: (query: QueryParams) => string;
}

export interface ResolvedScope {
  layer: LayerInput;
  serialization?: ResolvedSerialization;
}

export type SettingsScope = "collection" | "api" | "resource";

const SETTINGS_KEYS = new Set([
  "request",
  "retry",
  "response",
  "validation",
  "serialization",
  "middleware",
]);
const REQUEST_KEYS = new Set(["timeout"]);
const RESPONSE_KEYS = new Set(["order", "unwrap", "parse", "validate"]);
const VALIDATION_KEYS = new Set(["strict"]);
const SERIALIZATION_KEYS = new Set(["queryArrayFormat", "query", "querySerializer"]);
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const DEFAULT_ORDER: readonly ResponseStage[] = RESPONSE_STAGES;

export interface SettingsInspection {
  request: { timeout?: { total?: number; perAttempt?: number } };
  retry?: {
    count: number;
    methods: readonly string[];
    statusCodes?: readonly number[];
    backoff: string;
    delay: number;
    maxDelay: number;
    jitter: string | false;
    respectRetryAfter: boolean;
    shouldRetry?: true;
    onRetry?: true;
  };
  response: {
    /** A string unwrap path is kept. A function is `true`. Absent or `false` is `false`. */
    unwrap: string | boolean;
    parse: boolean;
    validate: boolean;
    order: readonly ResponseStage[];
  };
  validation: { strict: boolean };
  serialization: {
    queryArrayFormat: QueryArrayFormat;
    query?: QueryOptions;
    querySerializer: boolean;
  };
  middleware: {
    onRequest: number;
    onAttempt: number;
    onAttemptResponse: number;
    onResponse: number;
    onError: number;
  };
}

const SNAPSHOTS = new WeakMap<object, SettingsInspection>();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertSafeKeys(where: string, value: Record<string, unknown>): void {
  for (const key of Object.keys(value)) {
    if (UNSAFE_KEYS.has(key)) {
      throw new ConfigError(`${where} has unsafe option "${key}".`);
    }
  }
}

function unknownKey(where: string, key: string, allowed: Set<string>): never {
  throw new ConfigError(
    `${where} has unknown option "${key}". Supported: ${[...allowed].join(", ")}.`,
  );
}

function conflict(where: string, legacy: string, modern: string): never {
  throw new ConfigError(
    `${where}: \`${legacy}\` and \`${modern}\` both set the same option. Keep one at this scope. A deeper scope may override it.`,
  );
}

/** A listed order is stored only when it differs from the historical pipeline. */
export function canonicalResponseOrder(
  order: readonly ResponseStage[] | undefined,
): readonly ResponseStage[] | undefined {
  if (!order) return undefined;
  if (
    order.length === DEFAULT_ORDER.length &&
    order.every((stage, i) => stage === DEFAULT_ORDER[i])
  ) {
    return undefined;
  }
  return [...order];
}

export function parseResponseOrder(where: string, value: unknown): ResponseStage[] {
  if (!Array.isArray(value)) {
    throw new ConfigError(`${where} must list each of ${RESPONSE_STAGES.join(", ")} exactly once.`);
  }
  if (value.length !== RESPONSE_STAGES.length) {
    throw new ConfigError(
      `${where} must list each of ${RESPONSE_STAGES.join(", ")} exactly once. Omitting a stage is not allowed; disable a hook with false instead.`,
    );
  }
  const seen = new Set<string>();
  for (const stage of value) {
    if (typeof stage !== "string" || !RESPONSE_STAGES.includes(stage as ResponseStage)) {
      throw new ConfigError(
        `${where} has unknown stage ${JSON.stringify(stage)}. Supported: ${RESPONSE_STAGES.join(", ")}.`,
      );
    }
    if (seen.has(stage)) throw new ConfigError(`${where} lists "${stage}" more than once.`);
    seen.add(stage);
  }
  return [...(value as ResponseStage[])];
}

function assertSettingsShape(
  where: string,
  settings: unknown,
  scope: SettingsScope,
): Record<string, unknown> {
  const at = `${where}.settings`;
  if (!isPlainObject(settings)) {
    throw new ConfigError(
      `${at} must be an object (got ${settings === null ? "null" : Array.isArray(settings) ? "array" : typeof settings}).`,
    );
  }
  assertSafeKeys(at, settings);
  for (const key of Object.keys(settings)) {
    if (!SETTINGS_KEYS.has(key)) {
      if (
        key === "upload" ||
        key === "download" ||
        key === "pagination" ||
        key === "errors" ||
        key === "security" ||
        key === "limits" ||
        key === "cache" ||
        key === "diagnostics" ||
        key === "concurrency" ||
        key === "integrations" ||
        key === "mock"
      ) {
        throw new ConfigError(
          `${at}.${key} is not a settings category. Existing upload, download, pagination, security and limit options stay on their own fields.`,
        );
      }
      unknownKey(at, key, SETTINGS_KEYS);
    }
  }
  if (settings.request !== undefined) {
    if (!isPlainObject(settings.request)) {
      throw new ConfigError(`${at}.request must be an object { timeout? }.`);
    }
    assertSafeKeys(`${at}.request`, settings.request);
    if ("timeoutMs" in settings.request) {
      throw new ConfigError(
        `${at}.request.timeoutMs is not used. Set \`timeout\` to a number (total deadline in ms) or { total, perAttempt } so per-attempt budgets stay available.`,
      );
    }
    for (const key of Object.keys(settings.request)) {
      if (!REQUEST_KEYS.has(key)) unknownKey(`${at}.request`, key, REQUEST_KEYS);
    }
  }
  if (settings.response !== undefined) {
    if (!isPlainObject(settings.response)) {
      throw new ConfigError(
        `${at}.response must be an object { order?, unwrap?, parse?, validate? }.`,
      );
    }
    assertSafeKeys(`${at}.response`, settings.response);
    for (const key of Object.keys(settings.response)) {
      if (!RESPONSE_KEYS.has(key)) unknownKey(`${at}.response`, key, RESPONSE_KEYS);
    }
    if (settings.response.order !== undefined) {
      parseResponseOrder(`${at}.response.order`, settings.response.order);
    }
  }
  if (settings.validation !== undefined) {
    if (!isPlainObject(settings.validation)) {
      throw new ConfigError(`${at}.validation must be an object { strict? }.`);
    }
    assertSafeKeys(`${at}.validation`, settings.validation);
    for (const key of Object.keys(settings.validation)) {
      if (!VALIDATION_KEYS.has(key)) unknownKey(`${at}.validation`, key, VALIDATION_KEYS);
    }
    if (
      settings.validation.strict !== undefined &&
      typeof settings.validation.strict !== "boolean"
    ) {
      throw new ConfigError(
        `${at}.validation.strict must be a boolean (got ${typeof settings.validation.strict}).`,
      );
    }
  }
  if (settings.serialization !== undefined) {
    if (scope === "resource") {
      throw new ConfigError(
        `${at}.serialization: query serialization is client-wide. Set it on defineApi() or defineApis(), not on a resource.`,
      );
    }
    if (!isPlainObject(settings.serialization)) {
      throw new ConfigError(
        `${at}.serialization must be an object { queryArrayFormat?, query?, querySerializer? }.`,
      );
    }
    assertSafeKeys(`${at}.serialization`, settings.serialization);
    for (const key of Object.keys(settings.serialization)) {
      if (!SERIALIZATION_KEYS.has(key)) unknownKey(`${at}.serialization`, key, SERIALIZATION_KEYS);
    }
  }
  if (
    settings.retry !== undefined &&
    isPlainObject(settings.retry) &&
    "attempts" in settings.retry
  ) {
    throw new ConfigError(
      `${at}.retry.attempts is not a retry option. Use \`count\` (or a number). settings.retry accepts the existing RetryOption.`,
    );
  }
  if (settings.middleware !== undefined) validateHooks(`${at}.middleware`, settings.middleware);
  return settings;
}

function mergeResponse(
  legacy: Record<string, unknown> | undefined,
  modern: Record<string, unknown> | undefined,
): LayerOptions["response"] | undefined {
  if (!legacy && !modern) return undefined;
  const unwrap = modern && modern.unwrap !== undefined ? modern.unwrap : legacy?.unwrap;
  const parse = modern && modern.parse !== undefined ? modern.parse : legacy?.parse;
  const validate = modern && modern.validate !== undefined ? modern.validate : legacy?.validate;
  if (unwrap === undefined && parse === undefined && validate === undefined) return undefined;
  return { unwrap, parse, validate } as LayerOptions["response"];
}

/**
 * Fold one scope's legacy fields and `settings` into a single layer. Same-scope duplicates throw.
 * The input object is not modified.
 */
export function resolveScopeSettings(
  where: string,
  raw: Record<string, unknown>,
  scope: SettingsScope,
): ResolvedScope {
  assertSafeKeys(where, raw);
  const settings =
    raw.settings === undefined ? undefined : assertSettingsShape(where, raw.settings, scope);
  const request = settings && isPlainObject(settings.request) ? settings.request : undefined;
  const responseSettings =
    settings && isPlainObject(settings.response) ? settings.response : undefined;
  const legacyResponse = isPlainObject(raw.response) ? raw.response : undefined;
  const serial =
    settings && isPlainObject(settings.serialization) ? settings.serialization : undefined;

  if (raw.retry !== undefined && settings?.retry !== undefined)
    conflict(where, "retry", "settings.retry");
  if (raw.timeout !== undefined && request?.timeout !== undefined) {
    conflict(where, "timeout", "settings.request.timeout");
  }
  if (raw.middleware !== undefined && settings?.middleware !== undefined) {
    conflict(where, "middleware", "settings.middleware");
  }
  if (legacyResponse && responseSettings) {
    for (const key of ["unwrap", "parse", "validate"] as const) {
      if (legacyResponse[key] !== undefined && responseSettings[key] !== undefined) {
        conflict(where, `response.${key}`, `settings.response.${key}`);
      }
    }
  }
  if (scope === "api" && serial) {
    if (raw.queryArrayFormat !== undefined && serial.queryArrayFormat !== undefined) {
      conflict(where, "queryArrayFormat", "settings.serialization.queryArrayFormat");
    }
    if (raw.query !== undefined && serial.query !== undefined) {
      conflict(where, "query", "settings.serialization.query");
    }
    if (raw.querySerializer !== undefined && serial.querySerializer !== undefined) {
      conflict(where, "querySerializer", "settings.serialization.querySerializer");
    }
  }

  const retry = (settings && settings.retry !== undefined ? settings.retry : raw.retry) as
    RetryOption | undefined;
  const timeout = (request && request.timeout !== undefined ? request.timeout : raw.timeout) as
    TimeoutOption | undefined;
  const middleware =
    settings && settings.middleware !== undefined ? settings.middleware : raw.middleware;
  const retryLabel = settings?.retry !== undefined ? `${where}.settings.retry` : `${where}.retry`;
  const timeoutLabel =
    request?.timeout !== undefined ? `${where}.settings.request.timeout` : `${where}.timeout`;
  resolveRetryConfig(retry, retryLabel);
  resolveTimeout(timeout, timeoutLabel);

  const response = mergeResponse(legacyResponse, responseSettings);
  if (response && responseSettings) {
    validateResponseOptions(`${where}.settings.response`, {
      ...(responseSettings.unwrap !== undefined ? { unwrap: responseSettings.unwrap } : {}),
      ...(responseSettings.parse !== undefined ? { parse: responseSettings.parse } : {}),
      ...(responseSettings.validate !== undefined ? { validate: responseSettings.validate } : {}),
    });
  }

  const layer: LayerInput = {
    headers: raw.headers as LayerOptions["headers"],
    timeout,
    retry,
    middleware: middleware as LayerOptions["middleware"],
    transforms: raw.transforms as LayerOptions["transforms"],
    response,
    ...(responseSettings?.order !== undefined
      ? {
          responseOrder: parseResponseOrder(
            `${where}.settings.response.order`,
            responseSettings.order,
          ),
        }
      : {}),
    ...(settings && isPlainObject(settings.validation) && settings.validation.strict !== undefined
      ? { strict: settings.validation.strict as boolean }
      : {}),
  };

  let serialization: ResolvedSerialization | undefined;
  if (scope !== "resource") {
    const queryArrayFormat = (serial?.queryArrayFormat ?? raw.queryArrayFormat) as
      QueryArrayFormat | undefined;
    const query = (serial?.query ?? raw.query) as QueryOptions | undefined;
    const querySerializer = (serial?.querySerializer ?? raw.querySerializer) as
      ResolvedSerialization["querySerializer"] | undefined;
    if (
      queryArrayFormat !== undefined &&
      queryArrayFormat !== "repeat" &&
      queryArrayFormat !== "comma" &&
      queryArrayFormat !== "brackets"
    ) {
      throw new ConfigError(
        `${where}.settings.serialization.queryArrayFormat must be "repeat", "comma", or "brackets" (got ${String(queryArrayFormat)}).`,
      );
    }
    if (query !== undefined) {
      validateQueryOptions(
        serial?.query !== undefined ? `${where}.settings.serialization.query` : `${where}.query`,
        query,
      );
    }
    if (querySerializer !== undefined && typeof querySerializer !== "function") {
      throw new ConfigError(`${where}.settings.serialization.querySerializer must be a function.`);
    }
    if (queryArrayFormat !== undefined || query !== undefined || querySerializer !== undefined) {
      serialization = { queryArrayFormat, query, querySerializer };
    }
  }

  return { layer, serialization };
}

export function resolveApisOptions(options: unknown): ResolvedScope | undefined {
  if (options === undefined) return undefined;
  if (!isPlainObject(options)) {
    throw new ConfigError(
      `defineApis() options must be an object { settings? } (got ${options === null ? "null" : typeof options}).`,
    );
  }
  assertSafeKeys("defineApis() options", options);
  for (const key of Object.keys(options)) {
    if (key !== "settings") {
      throw new ConfigError(
        `defineApis() options has unknown option "${key}". Supported: settings. An API named "${key}" belongs in the first argument.`,
      );
    }
  }
  if (options.settings === undefined) return undefined;
  return resolveScopeSettings("defineApis()", { settings: options.settings }, "collection");
}

function mergeQuery(
  base: QueryOptions | undefined,
  over: QueryOptions | undefined,
): QueryOptions | undefined {
  if (!base) return over;
  if (!over) return base;
  return {
    ...(base.nulls !== undefined ? { nulls: base.nulls } : {}),
    ...(base.emptyArrays !== undefined ? { emptyArrays: base.emptyArrays } : {}),
    ...(base.booleans !== undefined ? { booleans: base.booleans } : {}),
    ...(over.nulls !== undefined ? { nulls: over.nulls } : {}),
    ...(over.emptyArrays !== undefined ? { emptyArrays: over.emptyArrays } : {}),
    ...(over.booleans !== undefined ? { booleans: over.booleans } : {}),
  };
}

/** Collection defaults, then the API's own serialization. Neither object is mutated. */
export function mergeSerialization(
  collection: ResolvedSerialization | undefined,
  api: ResolvedSerialization | undefined,
): ResolvedSerialization {
  return {
    queryArrayFormat: api?.queryArrayFormat ?? collection?.queryArrayFormat,
    query: mergeQuery(collection?.query, api?.query),
    querySerializer: api?.querySerializer ?? collection?.querySerializer,
  };
}

export function inspectLayer(
  prepared: {
    timeout?: { total?: number; perAttempt?: number };
    retry?: {
      count: number;
      methods: readonly string[];
      statusCodes?: readonly number[];
      backoff: string;
      delay: number;
      maxDelay: number;
      jitter: string | false;
      respectRetryAfter: boolean;
      shouldRetry?: unknown;
      onRetry?: unknown;
    };
    responseUnwrap?: unknown;
    responseParse?: unknown;
    responseValidate?: unknown;
    responseOrder?: readonly ResponseStage[];
    strict?: boolean;
    onRequest: readonly unknown[];
    onAttempt: readonly unknown[];
    onAttemptResponse: readonly unknown[];
    onResponse: readonly unknown[];
    onError: readonly unknown[];
  },
  serialization: ResolvedSerialization & { queryArrayFormat?: QueryArrayFormat },
): SettingsInspection {
  const retry = prepared.retry
    ? {
        count: prepared.retry.count,
        methods: [...prepared.retry.methods],
        ...(prepared.retry.statusCodes ? { statusCodes: [...prepared.retry.statusCodes] } : {}),
        backoff: prepared.retry.backoff,
        delay: prepared.retry.delay,
        maxDelay: prepared.retry.maxDelay,
        jitter: prepared.retry.jitter,
        respectRetryAfter: prepared.retry.respectRetryAfter,
        ...(prepared.retry.shouldRetry ? { shouldRetry: true as const } : {}),
        ...(prepared.retry.onRetry ? { onRetry: true as const } : {}),
      }
    : undefined;
  const inspection: SettingsInspection = {
    request: { ...(prepared.timeout ? { timeout: { ...prepared.timeout } } : {}) },
    ...(retry ? { retry } : {}),
    response: {
      unwrap:
        typeof prepared.responseUnwrap === "string"
          ? prepared.responseUnwrap
          : prepared.responseUnwrap !== undefined,
      parse: prepared.responseParse !== undefined,
      validate: prepared.responseValidate !== undefined,
      order: [...(prepared.responseOrder ?? DEFAULT_ORDER)],
    },
    validation: { strict: prepared.strict === true },
    serialization: {
      queryArrayFormat: serialization.queryArrayFormat ?? "repeat",
      ...(serialization.query ? { query: { ...serialization.query } } : {}),
      querySerializer: serialization.querySerializer !== undefined,
    },
    middleware: {
      onRequest: prepared.onRequest.length,
      onAttempt: prepared.onAttempt.length,
      onAttemptResponse: prepared.onAttemptResponse.length,
      onResponse: prepared.onResponse.length,
      onError: prepared.onError.length,
    },
  };
  return Object.freeze(inspection);
}

export function rememberSettings(resource: object, inspection: SettingsInspection): void {
  SNAPSHOTS.set(resource, inspection);
}

/**
 * Effective resource settings (collection, API, then resource). Operation legacy overrides are
 * not included. Headers are omitted. Functions are reported as present, not serialized.
 */
export function inspectSettings(resource: object): SettingsInspection {
  const found = SNAPSHOTS.get(resource);
  if (!found) {
    throw new ConfigError(
      "inspectSettings() expects a resource client created by defineApi() or defineApis().",
    );
  }
  return found;
}
