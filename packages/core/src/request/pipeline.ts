import { AbortError, ApiError, ConfigError, HttpError, NetworkError, TimeoutError } from "../errors/index.js";
import {
  assertSameOrigin,
  buildQueryString,
  buildUrl,
  interpolatePath,
  requestOrigin,
  resolveHeaders,
  serializeBody,
  type BaseUrl,
} from "../http/index.js";
import { routeToIntent, runBuiltin, type BuiltinIntent, type MockSource, type MockStore, type PaginationMode } from "../mock/index.js";
import { transformKeys, type KeyCase } from "../transform/keys.js";
import type { QueryArrayFormat } from "../types/definition.js";
import type { HeadersSource, HttpMethod, PathParams, QueryParams } from "../types/http.js";
import type { ErrorMiddleware, RequestMiddleware, ResponseMiddleware } from "../types/middleware.js";
import type { ResolvedRetryConfig } from "../types/retry.js";
import type { ApiRequest, ApiResponse, RequestOptions, Transport } from "../types/transport.js";
import { computeBackoffMs, decideRetry, delay, parseRetryAfter, resolveRetryConfig } from "./retry.js";

/** Client-wide state, fixed at construction. */
export interface ClientRuntime {
  base: BaseUrl;
  transport: Transport;
  queryArrayFormat: QueryArrayFormat;
  querySerializer?: (query: QueryParams) => string;
}

/** Resource-wide state, fixed at construction (mock store state is the only mutable part). */
export interface ResourceRuntime {
  name: string;
  path: string;
  mock?: { store: MockStore; source: MockSource };
  pagination?: PaginationMode;
}

/** Everything a call needs that does not depend on its arguments — resolved once. */
export interface PreparedOperation {
  name: string;
  method: HttpMethod;
  /** Resource path joined with the operation path (`/users/:id`) or an absolute URL. */
  path: string;
  /** Operation path relative to the resource path (`/:id`), used to route mocked requests. */
  relativePath: string;
  hasBody: boolean;
  headers: readonly HeadersSource[];
  timeout?: number;
  retry?: ResolvedRetryConfig;
  onRequest: readonly RequestMiddleware[];
  onResponse: readonly ResponseMiddleware[];
  onError: readonly ErrorMiddleware[];
  requestKeys?: KeyCase;
  responseKeys?: KeyCase;
}

/** Arguments of one call. */
export interface CallInput {
  params?: PathParams;
  query?: QueryParams;
  body?: unknown;
  options?: RequestOptions;
  /** Replace the operation path for this call (dynamic `getBy` paths, `ctx.request` paths). */
  path?: string;
  relativePath?: string;
  method?: HttpMethod;
  hasBody?: boolean;
  /** Builtin semantics for a mocked resource; absent → route by method + relative path. */
  intent?: (wire: { query?: Record<string, unknown>; body?: unknown }) => BuiltinIntent;
  /** Treat an HTTP 404 as a successful response for `fromHttp` to interpret (used by `exists`). */
  allow404?: boolean;
  /**
   * Builtin-specific shaping of an HTTP result (after response key transforms, before response
   * middleware). Mocked builtins already return their final shape and skip this.
   */
  fromHttp?: (data: unknown, status: number) => unknown;
  /** Response shaping for both HTTP and mock (e.g. `slice` on `getAll`), before response middleware. */
  shape?: (data: unknown) => unknown;
}

const REQUEST_KEYS = ["method", "url", "headers", "signal", "meta"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function transformQuery(query: QueryParams | undefined, to: KeyCase | undefined): QueryParams | undefined {
  if (!query || !to) return query;
  return transformKeys(query, to) as QueryParams;
}

/** One controller per logical call: overall timeout + caller signal, cleaned up in `finally`. */
function createCallSignal(timeout: number | undefined, external: AbortSignal | undefined) {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => controller.abort(external!.reason);
  if (external) {
    if (external.aborted) controller.abort(external.reason);
    else external.addEventListener("abort", onAbort, { once: true });
  }
  if (timeout !== undefined && timeout > 0 && !controller.signal.aborted) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new TimeoutError(`Request timed out after ${timeout}ms`));
    }, timeout);
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      if (timer) clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    },
  };
}

/**
 * Normalize anything thrown during a call. Cancellation is decided by our own signal state, so a
 * timeout is never reported as a user abort (or vice versa) and neither looks like an HTTP error.
 */
function classify(error: unknown, signal: AbortSignal, timedOut: boolean, request?: ApiRequest): unknown {
  if (signal.aborted && !(error instanceof HttpError)) {
    if (timedOut) {
      return error instanceof TimeoutError ? attach(error, request) : new TimeoutError(undefined, { request, cause: error });
    }
    return error instanceof AbortError ? attach(error, request) : new AbortError(undefined, { request, cause: signal.reason ?? error });
  }
  if (error instanceof ApiError) return attach(error, request);
  return error;
}

function attach<E extends ApiError>(error: E, request?: ApiRequest): E {
  error.request ??= request;
  return error;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new AbortError();
}

function assertRequest(value: unknown, where: string): ApiRequest {
  if (!value || typeof value !== "object") throw new ConfigError(`${where} must return a request object (or nothing).`);
  const req = value as ApiRequest;
  for (const key of REQUEST_KEYS) {
    if (!(key in req)) throw new ConfigError(`${where} returned a request without "${key}".`);
  }
  if (!(req.headers instanceof Headers)) throw new ConfigError(`${where} returned a request whose headers is not a Headers instance.`);
  if (typeof req.url !== "string") throw new ConfigError(`${where} returned a request with a non-string url.`);
  return req;
}

function assertResponse(value: unknown, where: string): ApiResponse<unknown> {
  if (!value || typeof value !== "object" || !("data" in value) || typeof (value as { status?: unknown }).status !== "number") {
    throw new ConfigError(`${where} must return a response object { data, status, headers, request } (or nothing).`);
  }
  const res = value as ApiResponse<unknown>;
  if (!(res.headers instanceof Headers)) throw new ConfigError(`${where} returned a response whose headers is not a Headers instance.`);
  return res;
}

/**
 * The single execution lifecycle for every operation, HTTP or mocked:
 *
 * 1. effective config (pre-resolved on `op`)  2. dynamic headers  3. request middleware
 * 4. request key transform (serialization)    5. origin check (HTTP)  6. HTTP (with retry) or mock
 * 7. response key transform + op shaping      8. response middleware  9. result
 *
 * On failure, error middleware runs (root → resource → operation) and may recover.
 */
export async function runOperation(
  client: ClientRuntime,
  resource: ResourceRuntime,
  op: PreparedOperation,
  call: CallInput,
): Promise<unknown> {
  const options = call.options ?? {};
  const timeout = options.timeout ?? op.timeout;
  const { signal, timedOut, cleanup } = createCallSignal(timeout, options.signal);
  const mocked = resource.mock !== undefined;
  let request: ApiRequest | undefined;

  try {
    throwIfAborted(signal);
    const method = call.method ?? op.method;
    const pathTemplate = call.path ?? op.path;
    const path = interpolatePath(pathTemplate, call.params);
    const query = transformQuery(call.query ?? options.query, op.requestKeys);
    const qs = client.querySerializer
      ? normalizeQs(client.querySerializer(query ?? {}))
      : buildQueryString(query, client.queryArrayFormat);
    const origin = mocked ? client.base.origin : requestOrigin(client.base);
    const headers = await resolveHeaders(op.headers, options.headers);
    throwIfAborted(signal);

    request = {
      method,
      url: buildUrl(client.base, path, qs, origin),
      path,
      baseURL: client.base.raw,
      headers,
      params: call.params,
      query,
      body: call.body,
      signal,
      timeout,
      meta: { ...(options.meta ?? {}) },
      resource: resource.name,
      operation: op.name,
      mocked,
    };

    for (const hook of op.onRequest) {
      const next = await hook(request);
      if (next !== undefined) request = assertRequest(next, `request middleware for ${resource.name}.${op.name}`);
      throwIfAborted(signal);
    }

    const hasBody = call.hasBody ?? op.hasBody;
    const wireBody = hasBody && op.requestKeys ? transformKeys(request.body, op.requestKeys) : request.body;

    let status: number;
    let responseHeaders: Headers;
    let raw: Response | undefined;
    let data: unknown;

    if (resource.mock) {
      // Mocked resources execute the resolved operation against the store. They never reach a
      // transport, whatever the URL looks like after middleware.
      const { store, source } = resource.mock;
      const wire = { query: request.query as Record<string, unknown> | undefined, body: hasBody ? wireBody : undefined };
      const relative = interpolatePath(call.relativePath ?? op.relativePath, call.params);
      const intent = call.intent ? call.intent(wire) : routeToIntent(request.method, relative, wire.query, wire.body, source.label);
      const result = await runBuiltin(store, source, intent, resource.pagination);
      throwIfAborted(signal);
      status = result.status;
      responseHeaders = new Headers();
      data = result.data;
    } else {
      assertSameOrigin(request.url, origin!);
      const response = await sendWithRetry(client, op, request, hasBody ? wireBody : undefined, options, signal, call.allow404 === true);
      status = response.status;
      responseHeaders = response.headers;
      raw = response.raw;
      data = response.body;
      if (op.responseKeys) data = transformKeys(data, op.responseKeys);
      if (call.fromHttp) data = call.fromHttp(data, status);
    }

    if (resource.mock && op.responseKeys) data = transformKeys(data, op.responseKeys);
    if (call.shape) data = call.shape(data);

    let response: ApiResponse<unknown> = { data, status, headers: responseHeaders, request, raw };
    for (const hook of op.onResponse) {
      const next = await hook(response);
      if (next !== undefined) response = assertResponse(next, `response middleware for ${resource.name}.${op.name}`);
    }
    return options.full ? response : response.data;
  } catch (thrown) {
    let error = classify(thrown, signal, timedOut(), request);
    for (const hook of op.onError) {
      try {
        const recovered = await hook(error, { request });
        if (recovered !== undefined) return recovered;
      } catch (next) {
        error = next;
      }
    }
    throw error;
  } finally {
    cleanup();
  }
}

function normalizeQs(value: string): string {
  if (!value) return "";
  return value.startsWith("?") ? value : `?${value}`;
}

function isReplayable(body: unknown): boolean {
  return !(typeof ReadableStream !== "undefined" && body instanceof ReadableStream);
}

/**
 * Transport attempts for one logical call. Retries happen only here: no middleware or header
 * provider re-runs. Overall timeout and caller cancellation stop both attempts and backoff.
 */
async function sendWithRetry(
  client: ClientRuntime,
  op: PreparedOperation,
  request: ApiRequest,
  wireBody: unknown,
  options: RequestOptions,
  signal: AbortSignal,
  allow404: boolean,
) {
  const retry = options.retry !== undefined ? resolveRetryConfig(options.retry, "options.retry") : op.retry;
  const headers = new Headers(request.headers);
  const body = serializeBody(wireBody, headers);
  const replayable = isReplayable(body);

  for (let attempt = 0; ; attempt++) {
    throwIfAborted(signal);
    let failure: ApiError;
    let failedResponse: ApiResponse<unknown> | undefined;
    try {
      const response = await client.transport.request({
        url: request.url,
        method: request.method,
        headers,
        body,
        signal,
        responseType: options.responseType,
      });
      if ((response.status >= 200 && response.status < 300) || (allow404 && response.status === 404)) {
        return response;
      }
      failedResponse = {
        data: response.body,
        status: response.status,
        headers: response.headers,
        request,
        raw: response.raw,
      };
      failure = new HttpError(`Request failed with status ${response.status}`, {
        status: response.status,
        data: response.body,
        request,
        response: failedResponse,
        attempt,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      failure =
        error instanceof ApiError
          ? error
          : new NetworkError(error instanceof Error ? error.message : "Network request failed", { cause: error });
      failure.request ??= request;
      failure.attempt = attempt;
    }

    const ctx = { request, response: failedResponse, attempt, method: request.method, error: failure };
    const retryAfter =
      retry?.respectRetryAfter && failedResponse ? parseRetryAfter(failedResponse.headers.get("retry-after")) : undefined;
    const canRetry =
      retry !== undefined &&
      replayable &&
      !signal.aborted &&
      decideRetry(retry, ctx, failure) &&
      (retryAfter === undefined || retryAfter <= retry.maxDelayMs);
    failure.retryable = canRetry;
    if (!canRetry) throw failure;

    await retry!.onRetry?.(ctx);
    await delay(retryAfter ?? computeBackoffMs(attempt, retry!), signal);
  }
}
