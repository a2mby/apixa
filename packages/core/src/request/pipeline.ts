import type { AdvancedTransferConfig, PresignedPolicy } from "../types/advanced-transfer.js";
import { assertRedirectOrigins } from "../http/redirect-origins.js";
import { isEmptyBody as isEmptyBodyValue } from "../schema/empty-response.js";
import { runAdvanced } from "../transfer/advanced.js";
import { assertPresigned } from "../http/url.js";
import { joinPath } from "../http/path.js";
import { runManagedMock } from "../mock/transaction.js";
import {
  AbortError,
  ApiError,
  ConfigError,
  MockError,
  HttpError,
  NetworkError,
  ParseError,
  ResponseShapeError,
  SerializationError,
  TimeoutError,
  TransformError,
  ValidationError,
  fileValidationError,
} from "../errors/index.js";
import { parseUnwrapPath, requiredKind } from "../api/validate.js";
import {
  assertSameOrigin,
  buildQueryString,
  buildUrl,
  containsBinary,
  interpolatePath,
  requestOrigin,
  resolveHeaders,
  serializeBody,
  type BaseUrl,
  type MultipartRuntime,
} from "../http/index.js";
import { TransferChannel, bindStreamLifetime, countedStream } from "../transfer/index.js";
import {
  bodyByteSize,
  checkResponseHead,
  responseTooLarge,
  streamLimit,
  validateRequestFiles,
  type ResolvedFileRules,
} from "../validation/index.js";
import {
  paginateList,
  routeToIntent,
  runBuiltin,
  runMockHandler,
  finalizeMockResponse,
  runMockWithFiles,
  type BuiltinIntent,
  type MockFileStorage,
  type MockHandlerContext,
  type MockResult,
  type MockSource,
  type MockStore,
  type PaginationMode,
} from "../mock/index.js";
import { transformKeys } from "../transform/keys.js";
import type {
  DataFormat,
  QueryArrayFormat,
  QueryOptions,
  ResponseHookContext,
} from "../types/definition.js";
import type { HeadersSource, HttpMethod, PathParams, QueryParams } from "../types/http.js";
import type {
  AttemptMiddleware,
  AttemptResponseMiddleware,
  ErrorMiddleware,
  RequestMiddleware,
  ResponseMiddleware,
} from "../types/middleware.js";
import type { ResolvedRetryConfig, ResolvedTimeout } from "../types/retry.js";
import type { KeyTransformConfig } from "../types/transform.js";
import type { ResolvedPagination } from "../api/pagination.js";
import {
  assertNoWireCollision,
  buildLivePaginationRequest,
  controlQueryKeys,
  logicalQueryKeys,
  normalizeMockPagination,
  normalizePaginationKeys,
  readLogicalPagination,
  type LogicalRead,
} from "../api/pagination-request.js";
import type {
  ApiRequest,
  ApiResponse,
  RequestOptions,
  ResponseType,
  TransferObserver,
  Transport,
} from "../types/transport.js";
import { isResponseType, RESPONSE_TYPES } from "../transport/read-body.js";
import { prepareQuery, validateAsync, type PreparedSchemas } from "../schema/index.js";
import {
  computeBackoffMs,
  decideRetry,
  delay,
  parseRetryAfter,
  resolveRetryConfig,
  resolveTimeout,
} from "./retry.js";

/** Client-wide state, fixed at construction. */
export interface ClientRuntime {
  base: BaseUrl;
  transport: Transport;
  queryArrayFormat: QueryArrayFormat;
  query?: QueryOptions;
  querySerializer?: (query: QueryParams) => string;
  /** Virtual file store shared by this client's mocked resources. */
  files: MockFileStorage;
}

/** Resource-wide state, fixed at construction (mock store state is the only mutable part). */
export interface ResourceRuntime {
  name: string;
  path: string;
  mock?: { store: MockStore; source: MockSource; files: MockFileStorage };
  /**
   * The shared resource pagination configuration. Only a function operation's routed
   * `ctx.request()` falls back to it (it has no operation configuration of its own); every
   * declared operation uses its own resolved `pagination`.
   */
  pagination?: ResolvedPagination;
}

/** Everything a call needs that does not depend on its arguments — resolved once. */
export interface PreparedOperation {
  transfer?: AdvancedTransferConfig;
  transferLayers?: Pick<
    PreparedOperation,
    | "headers"
    | "timeout"
    | "retry"
    | "onRequest"
    | "onAttempt"
    | "onAttemptResponse"
    | "onResponse"
    | "onError"
    | "requestTransform"
    | "responseTransform"
    | "responseUnwrap"
    | "responseParse"
    | "responseValidate"
  >;
  presigned?: PresignedPolicy;
  name: string;
  method: HttpMethod;
  /** Resource path joined with the operation path (`/users/:id`) or an absolute URL. */
  path: string;
  /** Operation path relative to the resource path (`/:id`), used to route mocked requests. */
  relativePath: string;
  hasBody: boolean;
  headers: readonly HeadersSource[];
  timeout?: ResolvedTimeout;
  retry?: ResolvedRetryConfig;
  onRequest: readonly RequestMiddleware[];
  onAttempt: readonly AttemptMiddleware[];
  onAttemptResponse: readonly AttemptResponseMiddleware[];
  onResponse: readonly ResponseMiddleware[];
  onError: readonly ErrorMiddleware[];
  requestTransform?: KeyTransformConfig;
  responseTransform?: KeyTransformConfig;
  responseUnwrap?: string | ((source: unknown, ctx: ResponseHookContext) => unknown);
  responseParse?: (data: unknown, ctx: ResponseHookContext) => unknown;
  responseValidate?: (data: unknown, ctx: ResponseHookContext) => unknown;
  /** Custom declarative operation: how it behaves on a mocked resource (absent → unsupported). */
  mockHandler?: (context: MockHandlerContext) => unknown;
  /** Resolved pagination for this operation (`getAll`, `getMany`, or custom declarative operation). */
  pagination?: ResolvedPagination;
  /** How the response body is read; absent → JSON. Fixed: a generated call cannot override it. */
  responseType?: ResponseType;
  /** Default transfer observer; a per-call `onTransfer` option wins. */
  onTransfer?: TransferObserver;
  /** Body encoding override; absent → JSON, or multipart automatically for binary values. */
  dataFormat?: DataFormat;
  /** Multipart encoding rules, with field names already in wire form. */
  multipart?: MultipartRuntime;
  /**
   * Mocked resources only: file-field wire names. Their `File` / `Blob` values are moved into the
   * mock file store and replaced by string references.
   */
  fileFields?: readonly string[];
  /** Opt-in file rules (resolved at construction); absent unless configured. */
  fileRules?: ResolvedFileRules;
  /** Largest accepted response body in bytes: a ceiling a per-call `maxResponseSize` can only lower. */
  maxResponseSize?: number;
  /** Exact origins a redirect may lead to, credential-free. Operation policy, never a call option. */
  redirectOrigins?: readonly string[];
  /** Accepted response `Content-Type`s, normalized. */
  responseAccept?: readonly string[];
  /** Opt-in idempotency header for writes (resolved at construction). */
  idempotency?: { header: string; generate: () => string };
  /** Standard Schema validators (`schema` option): body and query before dispatch, response last. */
  schema?: PreparedSchemas;
  /** `schema.response` is the `emptyResponse` marker: the operation resolves to `undefined`. */
  emptyResponse?: boolean;
}

/** Arguments of one call. */
export interface CallInput {
  params?: PathParams;
  query?: QueryParams;
  /**
   * Query values the operation generates itself (for example a builtin's id fields). Merged after
   * the caller's `query` has been validated, so a `schema.query` only ever sees caller input.
   */
  queryExtra?: Record<string, unknown>;
  body?: unknown;
  options?: RequestOptions & {
    pagination?: import("../types/definition.js").LogicalPaginationInput;
  };
  /** Internal: `body` / `query` already went through their schemas (set before a replay). */
  schemaValidated?: boolean;
  /** Replace the operation path for this call (dynamic `getBy` paths, `ctx.request` paths). */
  path?: string;
  relativePath?: string;
  method?: HttpMethod;
  hasBody?: boolean;
  /** Set on the single replay started from error middleware (prevents replay loops). */
  replayed?: boolean;
  /** Internal: raw advanced part bytes cannot be replaced by request middleware. */
  preserveBody?: boolean;
  /** Internal: protocol writes only expose safe, explicit middleware replay. */
  replayAllowed?: boolean;
  /** The key chosen for this logical call; a replay reuses it. */
  idempotencyKey?: string;
  /**
   * Builtin semantics for a mocked resource. Absent, the call is only simulated when it came from
   * `ctx.request()` (`routed`); a declarative custom operation is never guessed from its URL.
   */
  intent?: (wire: { query?: Record<string, unknown>; body?: unknown }) => BuiltinIntent;
  /** The call came from `ctx.request()` inside a function operation: mocks route it by method + path. */
  routed?: boolean;
  /** Body encoding for this call (from `ctx.request`); overrides the operation's. */
  dataFormat?: DataFormat;
  /** Treat an HTTP 404 as a successful response for `fromHttp` to interpret (used by `exists`). */
  allow404?: boolean;
  /**
   * Builtin-specific shaping of an HTTP result (after response key transforms, before response
   * middleware). Mocked builtins already return their final shape and skip this.
   */
  fromHttp?: (data: unknown, status: number, response: ApiResponse<unknown>) => unknown;
  /** Validate the final logical result on both live and normalized mock paths. */
  checkResult?: (data: unknown, status: number, response: ApiResponse<unknown>) => void;
  /** Last step on both paths, after `checkResult`: builtin ordering of the validated result. */
  finalize?: (data: unknown, status: number, response: ApiResponse<unknown>) => unknown;
  /**
   * Decoding, redirect allowlist and response-size ceiling of a request constructed inside an
   * operation definition (`ctx.request()`, a transfer protocol step). They replace the
   * operation's own values; generated operation calls never set them.
   */
  responseType?: ResponseType;
  redirectOrigins?: readonly string[];
  maxResponseSize?: number;
  /** Absolute total deadline (epoch ms) of the logical call being replayed: a replay never restarts it. */
  deadline?: number;
  /** Response shaping for both HTTP and mock (e.g. `slice` on `getAll`), before response middleware. */
  shape?: (data: unknown) => unknown;
  /** Map a live list response to the page contract (before response key transforms). */
  paginated?: boolean;
}

const REQUEST_KEYS = ["method", "url", "headers", "signal", "meta"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function applyTransform(value: unknown, rule: KeyTransformConfig | undefined): unknown {
  if (!rule) return value;
  return transformKeys(value, rule.keys, {
    exclude: rule.exclude,
    preserve: rule.preserve,
    maxDepth: rule.maxDepth,
  });
}

function transformQuery(
  query: QueryParams | undefined,
  rule: KeyTransformConfig | undefined,
): QueryParams | undefined {
  if (!query || !rule) return query;
  return applyTransform(query, rule) as QueryParams;
}

function transformedKeyName(key: string, rule: KeyTransformConfig): string {
  const out = applyTransform({ [key]: true }, rule);
  return isRecordValue(out) ? (Object.keys(out)[0] ?? key) : key;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function applyUnwrap(
  data: unknown,
  unwrap: string | ((source: unknown, ctx: ResponseHookContext) => unknown),
  ctx: ResponseHookContext,
  sourceResponse: ApiResponse<unknown>,
): Promise<unknown> {
  if (typeof unwrap === "function") {
    try {
      return await unwrap(data, ctx);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ResponseShapeError(`${ctx.resource}.${ctx.operation}: response.unwrap failed.`, {
        status: ctx.status,
        data: sourceResponse.source,
        response: sourceResponse,
        cause: err,
      });
    }
  }
  const segments = parseUnwrapPath(unwrap);
  if (!segments) {
    throw new ConfigError(
      `${ctx.resource}.${ctx.operation}: invalid response.unwrap path ${JSON.stringify(unwrap)}.`,
    );
  }
  let current: unknown = data;
  for (const segment of segments) {
    if (!isRecordValue(current) || !Object.hasOwn(current, segment)) {
      throw new ResponseShapeError(
        `${ctx.resource}.${ctx.operation}: expected response envelope property "${unwrap}" (missing "${segment}").`,
        { status: ctx.status, data: sourceResponse.source, response: sourceResponse },
      );
    }
    current = current[segment];
  }
  return current;
}

/** Transfer-event state for one logical call: one channel per attempt, only when observed. */
interface TransferSession {
  observer: TransferObserver | undefined;
  current?: TransferChannel;
}

function nextChannel(session: TransferSession, attempt: number): TransferChannel | undefined {
  if (!session.observer) return undefined;
  session.current = new TransferChannel(session.observer, attempt);
  return session.current;
}

/** End a started transfer because the call's signal fired: a timeout is an error, a cancel an abort. */
function failFromSignal(channel: TransferChannel | undefined, signal: AbortSignal): void {
  if (!channel) return;
  const reason = signal.reason;
  if (reason instanceof TimeoutError)
    channel.fail({ kind: "error", error: reason, willRetry: false });
  else channel.fail({ kind: "abort", reason });
}

/** One controller per logical call: overall timeout + caller signal, cleaned up in `finally`. */
function createCallSignal(
  timeout: number | undefined,
  external: AbortSignal | undefined,
  deadline: number | undefined,
) {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => controller.abort(external!.reason);
  if (external) {
    if (external.aborted) controller.abort(external.reason);
    else external.addEventListener("abort", onAbort, { once: true });
  }
  if (deadline !== undefined && !controller.signal.aborted) {
    const expire = () => {
      timedOut = true;
      controller.abort(
        new TimeoutError(
          timeout !== undefined ? `Request timed out after ${timeout}ms` : "Request timed out",
        ),
      );
    };
    const remaining = deadline - Date.now();
    if (remaining <= 0) expire();
    else timer = setTimeout(expire, remaining);
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
function classify(
  error: unknown,
  signal: AbortSignal,
  timedOut: boolean,
  request?: ApiRequest,
): unknown {
  if (signal.aborted && !(error instanceof HttpError)) {
    if (timedOut) {
      return error instanceof TimeoutError
        ? attach(error, request)
        : new TimeoutError(undefined, { request, cause: error });
    }
    return error instanceof AbortError
      ? attach(error, request)
      : new AbortError(undefined, { request, cause: signal.reason ?? error });
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
  if (!value || typeof value !== "object")
    throw new ConfigError(`${where} must return a request object (or nothing).`);
  const req = value as ApiRequest;
  for (const key of REQUEST_KEYS) {
    if (!(key in req)) throw new ConfigError(`${where} returned a request without "${key}".`);
  }
  if (!(req.headers instanceof Headers))
    throw new ConfigError(`${where} returned a request whose headers is not a Headers instance.`);
  if (typeof req.url !== "string")
    throw new ConfigError(`${where} returned a request with a non-string url.`);
  return req;
}

function assertResponse(value: unknown, where: string): ApiResponse<unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    !("data" in value) ||
    typeof (value as { status?: unknown }).status !== "number"
  ) {
    throw new ConfigError(
      `${where} must return a response object { data, status, headers, request } (or nothing).`,
    );
  }
  const res = value as ApiResponse<unknown>;
  if (!(res.headers instanceof Headers))
    throw new ConfigError(`${where} returned a response whose headers is not a Headers instance.`);
  return res;
}

const SAFE_REPLAY_METHODS: readonly HttpMethod[] = ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"];
const HTTP_METHODS: readonly HttpMethod[] = [...SAFE_REPLAY_METHODS, "POST", "PATCH"];

/** A per-attempt deadline on top of the call's signal. Only its timer is ever released. */
function createAttemptSignal(parent: AbortSignal, ms: number | undefined) {
  if (ms === undefined || ms <= 0) {
    return { signal: parent, timedOut: () => false, clear: () => {} };
  }
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(parent.reason);
  if (parent.aborted) onAbort();
  else parent.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new TimeoutError(`Attempt timed out after ${ms}ms`));
  }, ms);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    // The response (for example a stream) may outlive the attempt: it stays bound to the call's
    // signal through the link above, only the attempt deadline stops applying.
    clear: () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", onAbort);
    },
  };
}

/** Track mutations without cloning/consuming opaque values such as streams and files. */
function unchanged(value: unknown): () => boolean {
  const seen = new Set<object>();
  const checks: Array<() => boolean> = [];
  const visit = (v: unknown) => {
    if ((!isPlainObject(v) && !Array.isArray(v)) || seen.has(v)) return;
    seen.add(v);
    const keys = Object.keys(v);
    const object = v as Record<string, unknown>;
    const entries = keys.map((k) => [k, object[k]] as const);
    checks.push(
      () =>
        Object.keys(v).length === keys.length &&
        entries.every(([k, item]) => Object.hasOwn(v, k) && object[k] === item),
    );
    entries.forEach(([, item]) => visit(item));
  };
  visit(value);
  return () => checks.every((check) => check());
}

/** Bound advanced logical middleware/provider work to its existing call signal. */
function waitForSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason ?? new AbortError());
    if (signal.aborted) aborted();
    else signal.addEventListener("abort", aborted, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

/**
 * The single execution lifecycle for every operation, HTTP or mocked:
 *
 * 1. effective config (pre-resolved on `op`)   2. `schema.query` / `schema.body` (once, before
 *    pagination composition)                   3. dynamic headers   4. `onRequest` (once)
 * 5. re-check of the effective request (method kind, body schema, idempotency key, origin)
 * 6. request key transform (serialization)    7. transport attempts — `onAttempt`, send,
 *    `onAttemptResponse`, retry / backoff — or the mock engine
 * 8. decode → `response.unwrap` → response key transform → `response.parse` → builtin
 *    normalization → `response.validate`      9. `onResponse` (once, final success only)
 * 10. `schema.response` (once, on the final payload)   11. builtin result checks and ordering
 *
 * On terminal failure, `onError` runs once (root → resource → operation) and may recover.
 */
export async function runOperation(
  client: ClientRuntime,
  resource: ResourceRuntime,
  op: PreparedOperation,
  call: CallInput,
): Promise<unknown> {
  const options = call.options ?? {};
  const delegated = options.presigned;
  if (delegated && op.transfer)
    throw new ConfigError("Use presigned descriptors on protocol steps, not on the outer upload.");
  if (options.transfer && !op.transfer)
    throw new ConfigError("Transfer options require an advanced operation.");
  if (delegated && !op.presigned)
    throw new ConfigError("Presigned requests require an operation destination policy.");
  if (delegated && !client.transport.capabilities?.presigned)
    throw new ConfigError("Transport cannot enforce presigned request security.");
  if (delegated && (call.params || call.query || options.query || call.path || options.headers))
    throw new ConfigError(
      "Presigned requests cannot combine path, query or ordinary header options.",
    );
  for (const removed of ["responseType", "redirectOrigins"] as const) {
    if ((options as Record<string, unknown>)[removed] !== undefined) {
      throw new ConfigError(
        `${resource.name}.${op.name}: \`${removed}\` is not a call option. It is fixed by the operation definition (operations.${op.name}.${removed}); declare another operation for a different ${removed === "responseType" ? "response type" : "redirect policy"}.`,
      );
    }
  }
  const responseType = call.responseType ?? op.responseType ?? "json";
  const timeout =
    options.timeout !== undefined
      ? resolveTimeout(options.timeout, `${resource.name}.${op.name}: options.timeout`)
      : op.timeout;
  const totalTimeout =
    timeout?.total !== undefined && timeout.total > 0 ? timeout.total : undefined;
  // A replay continues inside the budget of the logical call that started it.
  const deadline =
    call.deadline ?? (totalTimeout !== undefined ? Date.now() + totalTimeout : undefined);
  const observer = options.onTransfer ?? op.onTransfer;
  if (observer !== undefined && typeof observer !== "function") {
    throw new ConfigError(`${resource.name}.${op.name}: onTransfer must be a function.`);
  }
  const session: TransferSession = { observer };
  const { signal, timedOut, cleanup } = createCallSignal(totalTimeout, options.signal, deadline);
  let ownsCleanup = false;
  let boundStream: ReadableStream<Uint8Array> | undefined;
  const mocked = resource.mock !== undefined;
  let request: ApiRequest | undefined;
  let idempotencyKey = call.idempotencyKey;

  const finalizeOutput = async (response: ApiResponse<unknown>): Promise<ApiResponse<unknown>> => {
    if (boundStream && response.data !== boundStream)
      throw new ConfigError("Response middleware must preserve the owned response stream.");
    if (op.schema?.response) {
      // Runs once, on the final application-facing payload: after unwrap, key transforms,
      // parsing, builtin normalization **and** response middleware, so middleware cannot hand
      // back data the schema would reject. Its output is the returned value. Every response
      // type is covered (a stream is validated as the stream object, never consumed); an empty
      // success (204 / 205) is validated as `undefined`.
      const before = response.data;
      const input =
        (response.status === 204 || response.status === 205) && before === null
          ? undefined
          : before;
      const parsed = await waitForSignal(
        validateAsync(op.schema.response, input, {
          resource: resource.name,
          operation: op.name,
          phase: "response",
        }),
        signal,
      );
      if (boundStream !== undefined && before === boundStream && parsed !== boundStream) {
        throw new ConfigError(
          `${resource.name}.${op.name}: schema.response must return the stream it validated, not another value.`,
        );
      }
      response = { ...response, data: parsed };
    }

    if (!op.transfer && !op.emptyResponse && (responseType === "json" || responseType === "auto")) {
      // Builtin invariants hold for whatever the hooks, middleware and schema produced.
      if (call.paginated ? op.pagination : undefined) {
        op.pagination!.validate(response.data);
      } else {
        call.checkResult?.(response.data, response.status, response);
      }
      if (call.finalize)
        response = { ...response, data: call.finalize(response.data, response.status, response) };
    }
    return response;
  };

  try {
    throwIfAborted(signal);
    if (call.paginated && op.pagination && responseType !== "json" && responseType !== "auto") {
      throw new ConfigError(
        `${resource.name}.${op.name}: pagination needs a JSON response; responseType "${String(responseType)}" cannot be normalized.`,
      );
    }
    if (!isResponseType(responseType)) {
      throw new ConfigError(
        `${resource.name}.${op.name}: responseType must be one of ${RESPONSE_TYPES.map((t) => JSON.stringify(t)).join(", ")} (got ${JSON.stringify(responseType)}).`,
      );
    }
    if (options.maxResponseSize !== undefined) {
      const n = options.maxResponseSize;
      if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) {
        throw new ConfigError(
          `${resource.name}.${op.name}: maxResponseSize must be a non-negative integer (got ${String(n)}).`,
        );
      }
    }
    const redirectOrigins = call.redirectOrigins ?? op.redirectOrigins;
    if (call.redirectOrigins !== undefined)
      assertRedirectOrigins(`${resource.name}.${op.name}`, call.redirectOrigins);
    if (redirectOrigins?.length && !mocked && !client.transport.capabilities?.redirectOrigins) {
      throw new ConfigError(
        `${resource.name}.${op.name}: redirectOrigins needs a transport that enforces the redirect allowlist (capabilities.redirectOrigins).`,
      );
    }
    // The operation's ceiling can be narrowed by a call, never raised.
    const responseCeiling = call.maxResponseSize ?? op.maxResponseSize;
    if (
      options.maxResponseSize !== undefined &&
      responseCeiling !== undefined &&
      options.maxResponseSize > responseCeiling
    ) {
      throw new ConfigError(
        `${resource.name}.${op.name}: options.maxResponseSize (${options.maxResponseSize}) exceeds the operation's maxResponseSize (${responseCeiling}). A call can only lower the limit.`,
      );
    }
    const maxResponse = options.maxResponseSize ?? responseCeiling;
    const responseLimits =
      maxResponse !== undefined || op.responseAccept
        ? { maxResponseBytes: maxResponse, accept: op.responseAccept }
        : undefined;
    const method = call.method ?? op.method;
    const pathTemplate = call.path ?? op.path;
    call = { ...call, params: call.params ?? options.params };
    const path = interpolatePath(pathTemplate, call.params);
    const paginationConfig = call.paginated ? op.pagination : undefined;
    const failPagination = (message: string): never => {
      throw new ValidationError(`${resource.name}.${op.name}: ${message}`);
    };
    // Request schemas run once per logical call, before pagination composition, request
    // middleware, transforms, file rules and dispatch: an invalid call reaches neither a transport
    // nor a mock store. The parsed values replace the caller's for every later stage (and for a replay).
    let callerQuery: QueryParams | undefined = call.schemaValidated
      ? call.query
      : (call.query ?? options.query);
    if (op.schema && !call.schemaValidated) {
      const at = (phase: "body" | "query") => ({
        resource: resource.name,
        operation: op.name,
        phase,
      });
      let body = call.body;
      if (op.schema.query) {
        callerQuery = prepareQuery(
          op.schema.query,
          callerQuery,
          at("query"),
          paginationConfig ? controlQueryKeys(paginationConfig) : undefined,
        );
      }
      if (op.schema.body) {
        body = await waitForSignal(validateAsync(op.schema.body, body, at("body")), signal);
      }
      call = { ...call, query: callerQuery, body, schemaValidated: true };
    }
    const appCallerQuery = callerQuery;
    if (options.pagination !== undefined) {
      if (!paginationConfig)
        throw new ConfigError("Call pagination requires a paginated operation.");
      if (!isPlainObject(options.pagination))
        throw new ValidationError("pagination input must be an object.");
      for (const key of Object.keys(options.pagination)) {
        if (!logicalQueryKeys(paginationConfig.mode).includes(key))
          throw new ValidationError(`Invalid pagination input "${key}".`);
        if (Object.hasOwn(callerQuery ?? {}, key))
          throw new ValidationError(`Pagination input "${key}" is also present in query.`);
      }
      callerQuery = { ...callerQuery, ...options.pagination } as QueryParams;
    }
    if (call.queryExtra) {
      callerQuery = { ...(callerQuery ?? {}), ...call.queryExtra } as QueryParams;
    }
    let paginationRead: LogicalRead | undefined;
    let paginationBody: { value: unknown } | undefined;
    let paginationHeaders: Record<string, string> | undefined;
    let paginationWireQuery: Record<string, unknown> | undefined;
    let query: QueryParams | undefined;
    if (paginationConfig)
      paginationRead = readLogicalPagination(
        paginationConfig,
        callerQuery as Record<string, unknown>,
        failPagination,
        { numericCursor: mocked },
      );
    if (paginationConfig && !mocked) {
      // Logical pagination input is validated and placed on the wire in one step (live only).
      const callQuery = callerQuery as Record<string, unknown> | undefined;
      paginationRead = readLogicalPagination(paginationConfig, callQuery, failPagination);
      const built = buildLivePaginationRequest(paginationConfig, paginationRead, {
        method,
        body: call.body,
        hasBody: call.hasBody ?? op.hasBody,
        transform: (q) =>
          (transformQuery(q as QueryParams, op.requestTransform) ?? q) as Record<string, unknown>,
        fail: failPagination,
      });
      paginationWireQuery = built.paginationQuery;
      query =
        Object.keys(built.query).length > 0 || callQuery ? (built.query as QueryParams) : undefined;
      if (built.bodyChanged) paginationBody = { value: built.body };
      paginationHeaders = built.headers;
    } else {
      query = transformQuery(callerQuery, op.requestTransform);
    }
    const origin = mocked ? client.base.origin : requestOrigin(client.base);
    const headerWork = delegated
      ? Promise.resolve(new Headers(delegated.headers))
      : resolveHeaders(op.headers, options.headers);
    const headers = await waitForSignal(headerWork, signal);
    if (delegated) assertPresigned(delegated.url, op.presigned!, headers);
    if (paginationHeaders) {
      for (const [name, value] of Object.entries(paginationHeaders)) {
        if (headers.has(name)) {
          failPagination(`pagination header "${name}" collides with a header already set.`);
        }
        headers.set(name, value);
      }
    }
    if (!delegated)
      idempotencyKey = applyIdempotency(op, options, headers, idempotencyKey, resource.name);
    throwIfAborted(signal);

    request = {
      method,
      url: delegated ? delegated.url : buildUrl(client.base, path, "", origin),
      ...(delegated ? { delegated: true } : {}),
      path,
      baseURL: client.base.raw,
      headers,
      params: call.params,
      query,
      body: paginationBody ? paginationBody.value : call.body,
      signal,
      timeout: totalTimeout,
      meta: { ...(options.meta ?? {}) },
      resource: resource.name,
      operation: op.name,
      mocked,
    };

    const bodyBeforeMiddleware = request.body;
    const bodyUnchanged = unchanged(request.body);
    const queryBeforeMiddleware = request.query;
    const queryUnchanged = unchanged(request.query);
    for (const hook of delegated ? (op.presigned!.requestMiddleware ?? []) : op.onRequest) {
      const next = await waitForSignal(Promise.resolve(hook(request)), signal);
      if (next !== undefined)
        request = assertRequest(next, `request middleware for ${resource.name}.${op.name}`);
      throwIfAborted(signal);
    }

    if (!delegated) {
      // Middleware may adjust the request, never the operation's contract: the effective request
      // is checked again before anything is sent (the origin is re-checked just before dispatch).
      const where = `request middleware for ${resource.name}.${op.name}`;
      if (!HTTP_METHODS.includes(request.method)) {
        throw new ConfigError(`${where} set an invalid HTTP method "${String(request.method)}".`);
      }
      if (requiredKind(request.method) !== requiredKind(method)) {
        throw new ConfigError(
          `${where} changed the method from ${method} to ${request.method}, which turns a ${requiredKind(method)} operation into a ${requiredKind(request.method)}. Declare a separate operation instead.`,
        );
      }
      if (
        op.idempotency &&
        idempotencyKey !== undefined &&
        request.headers.get(op.idempotency.header) !== idempotencyKey
      ) {
        throw new ConfigError(
          `${where} changed the ${op.idempotency.header} header. The idempotency key of a logical call must stay stable.`,
        );
      }
      if (
        op.schema?.body &&
        (call.hasBody ?? op.hasBody) &&
        !call.preserveBody &&
        (request.body !== bodyBeforeMiddleware || !bodyUnchanged())
      ) {
        // A replaced body is the effective logical input: it must satisfy the same schema.
        request.body = await waitForSignal(
          validateAsync(op.schema.body, request.body, {
            resource: resource.name,
            operation: op.name,
            phase: "body",
          }),
          signal,
        );
      }
    }

    if (request.signal !== signal)
      throw new ConfigError("Middleware cannot replace the call's cancellation signal.");
    if (!(call.hasBody ?? op.hasBody) && request.body !== undefined)
      throw new ConfigError(
        "Middleware cannot add a body to an operation without a body contract.",
      );

    if (delegated) {
      assertPresigned(request.url, op.presigned!, request.headers);
      if (request.url !== delegated.url || request.method !== method || request.body !== call.body)
        throw new ConfigError("Presigned middleware cannot change signed request identity.");
    } else {
      // The URL supplied by middleware may change the destination path and add query values.
      // Structured request.query wins on key conflicts, and is the source used by mocks too.
      const hashAt = request.url.indexOf("#");
      const fragment = hashAt < 0 ? "" : request.url.slice(hashAt);
      const beforeFragment = hashAt < 0 ? request.url : request.url.slice(0, hashAt);
      const queryAt = beforeFragment.indexOf("?");
      const destination = queryAt < 0 ? beforeFragment : beforeFragment.slice(0, queryAt);
      if (queryAt >= 0) {
        const fromUrl: Record<string, string | string[]> = Object.create(null);
        for (const [key, value] of new URLSearchParams(beforeFragment.slice(queryAt + 1))) {
          const previous = fromUrl[key];
          fromUrl[key] =
            previous === undefined
              ? value
              : Array.isArray(previous)
                ? [...previous, value]
                : [previous, value];
        }
        if (paginationConfig && !mocked) {
          assertNoWireCollision(paginationConfig, request.query, fromUrl, failPagination);
        }
        request.query = { ...fromUrl, ...request.query };
      }
      if (paginationConfig && !mocked) {
        assertNoWireCollision(paginationConfig, request.query, Object.create(null), failPagination);
      }
      if (
        op.schema?.query &&
        (request.query !== queryBeforeMiddleware || !queryUnchanged() || queryAt >= 0)
      ) {
        // Hooks see wire keys. Recover the known logical keys before validating their replacement,
        // while preserving builtin queryExtra entries and pagination wire parameters untouched.
        const reverse = new Map(
          Object.keys(appCallerQuery ?? {}).map((key) => [
            op.requestTransform ? transformedKeyName(key, op.requestTransform) : key,
            key,
          ]),
        );
        const extraKeys = new Set<string>();
        for (const key of Object.keys(call.queryExtra ?? {})) {
          extraKeys.add(key);
          if (op.requestTransform) extraKeys.add(transformedKeyName(key, op.requestTransform));
        }
        const paginationKeys = new Set<string>(
          paginationConfig ? controlQueryKeys(paginationConfig) : [],
        );
        if (paginationConfig && op.requestTransform) {
          for (const key of logicalQueryKeys(paginationConfig.mode)) {
            paginationKeys.add(transformedKeyName(key, op.requestTransform));
          }
        }
        for (const key of Object.keys(paginationWireQuery ?? {})) {
          paginationKeys.add(key);
        }
        const logical: Record<string, unknown> = {};
        const preservedExtra: Record<string, unknown> = {};
        const preservedPagination: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(request.query ?? {})) {
          const name = reverse.get(key) ?? key;
          if (extraKeys.has(key) || extraKeys.has(name)) {
            preservedExtra[key] = value;
          } else if (paginationKeys.has(key) || paginationKeys.has(name)) {
            preservedPagination[key] = value;
          } else {
            logical[name] = value;
          }
        }
        const parsed = prepareQuery(
          op.schema.query,
          logical as QueryParams,
          {
            resource: resource.name,
            operation: op.name,
            phase: "query",
          },
          paginationConfig ? controlQueryKeys(paginationConfig) : undefined,
        );
        const transformedApp = transformQuery(parsed as QueryParams, op.requestTransform) ?? {};
        request.query = {
          ...transformedApp,
          ...preservedExtra,
          ...preservedPagination,
        } as QueryParams;
      }
      const qs = client.querySerializer
        ? normalizeQs(serializeCustomQuery(client.querySerializer, request.query ?? {}))
        : buildQueryString(request.query, client.queryArrayFormat, client.query);
      request.url = `${destination}${qs}${fragment}`;
    }
    if (call.preserveBody && request.body !== call.body)
      throw new ValidationError("Transfer part middleware cannot replace the binary body.");
    const hasBody = call.hasBody ?? op.hasBody;
    const wireBody =
      hasBody && op.requestTransform && !delegated
        ? applyTransform(request.body, op.requestTransform)
        : request.body;

    // One shared checkpoint for live and mocked calls, before serialization and execution: a
    // rejected request makes no network call, no mock write and starts no transfer.
    const limitState: { error?: ValidationError } = {};
    let sendBody = hasBody ? wireBody : undefined;
    if (op.fileRules && hasBody) {
      const violations = validateRequestFiles(wireBody, op.fileRules);
      if (violations.length > 0) throw fileValidationError(violations, { request });
      if (typeof ReadableStream !== "undefined" && wireBody instanceof ReadableStream) {
        const cap = streamLimit(op.fileRules);
        if (cap) {
          // Counted as it flows (pull-based, nothing buffered); over the limit it errors the body.
          sendBody = countedStream(wireBody as ReadableStream<Uint8Array>, {
            limit: {
              bytes: cap.limit,
              error: (seen) =>
                (limitState.error = fileValidationError(
                  [{ code: cap.code, path: "$", limit: cap.limit, actual: seen }],
                  { request },
                )),
            },
          });
        }
      }
    }

    let status: number;
    let responseHeaders: Headers;
    let raw: Response | undefined;
    let data: unknown;
    let source: unknown;
    let finalRequest: ApiRequest | undefined;

    if (op.transfer) {
      if (resource.mock)
        throw new MockError(
          "MOCK_UNSUPPORTED",
          "Advanced transfer sessions require an explicit protocol transport; mocked resources never use the network.",
        );
      const advanced = await runAdvanced(
        op.transfer,
        request.body,
        {
          ...options,
          idempotencyKey,
          ...(op.responseType !== undefined ? { responseType: op.responseType } : {}),
          onTransfer: observer,
        },
        {
          signal,
          resource: resource.name,
          operation: op.name,
          params: call.params,
          query: request.query,
          request: async <T>(
            init: import("../types/builtins.js").OperationFnRequestInit & {
              kind: "read" | "write";
            },
            stepKey?: string,
          ) => {
            const stepMethod = init.method ?? "GET";
            const read = ["GET", "HEAD", "OPTIONS"].includes(stepMethod);
            if (
              (read ? "read" : "write") !== init.kind ||
              !["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(stepMethod)
            )
              throw new ConfigError("Transfer step kind does not match HTTP method.");
            if (init.presigned && init.headers !== undefined)
              throw new ConfigError("Put signed headers in the presigned descriptor.");
            const stepHeaders = new Headers(
              init.presigned ? undefined : (options.headers as HeadersInit),
            );
            new Headers(init.headers as HeadersInit).forEach((value, key) =>
              stepHeaders.set(key, value),
            );
            if (
              !init.presigned &&
              op.idempotency &&
              stepKey &&
              !new Headers(init.headers as HeadersInit).has(op.idempotency.header)
            )
              stepHeaders.set(op.idempotency.header, stepKey);
            const stepLimit =
              options.maxResponseSize !== undefined
                ? Math.min(options.maxResponseSize, init.maxResponseSize ?? Infinity)
                : (init.maxResponseSize ?? op.maxResponseSize ?? 4 * 1024 * 1024);
            return runOperation(
              client,
              resource,
              {
                ...op,
                ...op.transferLayers,
                retry: op.retry,
                timeout: op.timeout,
                headers: op.headers,
                transfer: undefined,
                idempotency: undefined,
                schema: undefined,
                method: stepMethod,
                path: joinPath(resource.path, init.path ?? ""),
                relativePath: init.path ?? "",
                responseType: init.responseType,
                emptyResponse: undefined,
                dataFormat: init.dataFormat,
                hasBody: init.body !== undefined,
              },
              {
                method: stepMethod,
                ...(init.presigned ? {} : { path: joinPath(resource.path, init.path ?? "") }),
                relativePath: init.path,
                params: init.params,
                query: init.query,
                body: init.body,
                responseType: init.responseType,
                redirectOrigins: init.redirectOrigins,
                maxResponseSize: stepLimit,
                deadline,
                preserveBody: init.body instanceof Blob,
                replayAllowed:
                  read ||
                  (!(
                    typeof ReadableStream !== "undefined" && init.body instanceof ReadableStream
                  ) &&
                    (containsBinary(init.body) ||
                    init.body instanceof FormData ||
                    init.body instanceof ArrayBuffer ||
                    ArrayBuffer.isView(init.body)
                      ? op.transfer!.protocol.replaySafeParts === true
                      : stepHeaders.has("idempotency-key") || !!(op.idempotency && stepKey))),
                options: {
                  headers: init.presigned ? undefined : stepHeaders,
                  signal: init.signal,
                  timeout: init.timeout,
                  retry: options.retry === false ? false : (init.retry ?? options.retry),
                  onTransfer: init.onTransfer,
                  meta: init.presigned ? init.meta : { ...options.meta, ...init.meta },
                  full: init.full,
                  presigned: init.presigned,
                },
              },
            ) as Promise<T>;
          },
        },
      );
      finalRequest = advanced.request;
      status = advanced.status;
      responseHeaders = advanced.headers;
      raw = advanced.raw;
      data = advanced.data;
      source = "source" in advanced ? (advanced as ApiResponse<unknown>).source : advanced.data;
    } else if (resource.mock) {
      // Mocked resources execute the resolved operation against the store. They never reach a
      // transport, whatever the URL looks like after middleware.
      const mockRequest = request;
      const { store, source: mockSource, files } = resource.mock;
      if (responseType === "stream") {
        throw new MockError(
          "MOCK_UNSUPPORTED",
          `${mockSource.label}: ${resource.name}.${op.name} cannot use responseType "stream" on a mocked resource; use "blob", "arrayBuffer", "text" or "json".`,
        );
      }
      const wire = {
        query: request.query as Record<string, unknown> | undefined,
        body: hasBody ? wireBody : undefined,
      };
      const mockPaginationQuery = (config: ResolvedPagination) =>
        normalizeMockPagination(
          config,
          normalizePaginationKeys(wire.query, config, (key) =>
            op.requestTransform ? transformedKeyName(key, op.requestTransform) : key,
          ),
          (message) => {
            throw new MockError("MOCK_INVALID_INPUT", `${mockSource.label}: ${message}`);
          },
        );
      const relative = interpolatePath(call.relativePath ?? op.relativePath, call.params);
      const managed = await runManagedMock(
        store,
        mockSource,
        files,
        resource.name,
        op.fileFields ?? [],
        signal,
        async (store, files) => {
          let result: MockResult;
          if (!call.intent && !call.routed) {
            // A custom declarative operation: only its own `mock` handler may run. Never guessed from
            // the URL, never sent to a transport.
            if (!op.mockHandler) {
              throw new MockError(
                "MOCK_UNSUPPORTED",
                `${mockSource.label}: custom operation "${resource.name}.${op.name}" (${mockRequest.method} ${relative || "/"}) has no mock behavior. ` +
                  `Add a \`mock\` handler to the operation, or implement it as a function operation ({ kind, run }) that uses ctx.request().`,
              );
            }
            result = await runMockHandler(op.mockHandler, store, {
              resource: resource.name,
              operation: op.name,
              method: mockRequest.method,
              params: { ...(call.params ?? {}) },
              query: op.pagination ? mockPaginationQuery(op.pagination) : wire.query,
              body: wire.body,
              signal,
              files,
            });
            // Ownership: an array is an unpaginated collection the engine paginates; an object is a
            // finished page (validated against the contract below, never paginated again).
            if (op.pagination && Array.isArray(result.data)) {
              result = {
                ...result,
                data: paginateList(
                  mockSource.label,
                  result.data,
                  op.pagination.mode,
                  mockPaginationQuery(op.pagination),
                ),
              };
            }
          } else {
            const mockPagination = op.pagination ?? (call.routed ? resource.pagination : undefined);
            const paginationMode = mockPagination?.mode;
            const mockWire = mockPagination
              ? { ...wire, query: mockPaginationQuery(mockPagination) }
              : wire;
            const intent = call.intent
              ? call.intent(mockWire)
              : routeToIntent(
                  mockRequest.method,
                  relative,
                  mockWire.query,
                  mockWire.body,
                  mockSource.label,
                );
            result =
              op.fileFields?.length || containsBinary(intent.body)
                ? await runMockWithFiles(
                    store,
                    mockSource,
                    intent,
                    paginationMode,
                    files,
                    op.fileFields ?? [],
                    { resource: resource.name, signal },
                  )
                : await runBuiltin(store, mockSource, intent, paginationMode);
          }
          return result;
        },
        async (result) => {
          throwIfAborted(signal);
          const status = result.status;
          // Mocked and live resources return the same type: coerce to `responseType` and give the
          // response the headers a real one would carry (content type, length, disposition).
          const finalized = await finalizeMockResponse(result.data, responseType);
          const responseHeaders = finalized.headers;
          const data = finalized.data;
          const mockHead = checkResponseHead(
            responseHeaders,
            status,
            mockRequest.method,
            responseLimits,
          );
          if (mockHead) throw mockHead;
          return { status, responseHeaders, data };
        },
        op.fileRules,
        !op.mockHandler &&
          ["getAll", "getById", "getMany", "getBy", "findFirst", "exists", "count"].includes(
            op.name,
          ),
      );
      status = managed.status;
      responseHeaders = managed.responseHeaders;
      data = managed.data;
      source = managed.data;
      const channel = nextChannel(session, 0);
      if (channel) {
        // Nothing crosses a wire on a mock: never invent bytes. Binary and text results have a real
        // size; a mocked JSON value has no wire size, so it is reported as unsupported.
        if (hasBody) channel.unsupported("upload", "mocked resource: no request body is sent");
        const length = responseHeaders.get("content-length");
        if (length !== null && /^\d+$/.test(length)) {
          const size = Number(length);
          channel.sink({ phase: "start", direction: "download", loaded: 0, total: size });
          channel.sink({ phase: "progress", direction: "download", loaded: size, total: size });
          channel.sink({ phase: "complete", direction: "download", loaded: size, total: size });
        } else {
          channel.unsupported("download", "mocked response has no wire size");
        }
      }
    } else {
      if (delegated) assertPresigned(request.url, op.presigned!, request.headers);
      else assertSameOrigin(request.url, origin!);
      const response = await sendWithRetry({
        client,
        op: call.dataFormat ? { ...op, dataFormat: call.dataFormat } : op,
        request,
        wireBody: sendBody,
        options,
        signal,
        allow404: call.allow404 === true,
        responseType,
        session,
        limits: responseLimits,
        limitState,
        redirectOrigins,
        perAttempt: timeout?.perAttempt,
        deadline,
        idempotencyKey,
      });
      status = response.status;
      responseHeaders = response.headers;
      raw = response.raw;
      data = response.body;
      source = response.body;
      if (responseLimits && response.status >= 200 && response.status < 300) {
        // The transport may have enforced these already; custom transports might not, so check the
        // head and any fully read body here too (a stream is counted below).
        const head = checkResponseHead(
          response.headers,
          response.status,
          request.method,
          responseLimits,
        );
        if (head) {
          if (typeof ReadableStream !== "undefined" && data instanceof ReadableStream) {
            (data as ReadableStream).cancel(head).catch(() => {});
          }
          throw head;
        }
        if (
          maxResponse !== undefined &&
          responseType !== "stream" &&
          responseType !== "json" &&
          responseType !== "auto"
        ) {
          const size = bodyByteSize(data);
          if (size !== undefined && size > maxResponse) throw responseTooLarge(maxResponse, size);
        }
        if (
          maxResponse !== undefined &&
          responseType === "stream" &&
          typeof ReadableStream !== "undefined" &&
          data instanceof ReadableStream
        ) {
          data = countedStream(data as ReadableStream<Uint8Array>, {
            limit: { bytes: maxResponse, error: (seen) => responseTooLarge(maxResponse, seen) },
          });
        }
      }
      if (responseType === "stream" && response.status >= 200 && response.status < 300) {
        if (typeof ReadableStream !== "undefined" && data instanceof ReadableStream) {
          // The stream outlives this Promise: keep the call's signal and timeout bound to it until
          // it is consumed, fails or is cancelled, and release them only then.
          ownsCleanup = true;
          const channel = session.current;
          data = boundStream = bindStreamLifetime(data as ReadableStream<Uint8Array>, {
            signal,
            abortError: () => classify(signal.reason, signal, timedOut(), request),
            settled(outcome) {
              try {
                if (outcome.kind === "complete") channel?.completeDownload();
                else if (outcome.kind === "cancel")
                  channel?.fail({ kind: "abort", reason: outcome.reason });
                else if (outcome.kind === "abort") failFromSignal(channel, signal);
                else
                  channel?.fail({
                    kind: "error",
                    error:
                      outcome.error instanceof Error
                        ? outcome.error
                        : new NetworkError("Response stream failed", { cause: outcome.error }),
                    willRetry: false,
                  });
              } finally {
                cleanup();
              }
            },
          });
        }
      }
    }

    if (delegated) {
      request.url = new URL(delegated.url).origin + new URL(delegated.url).pathname;
      request.path = new URL(delegated.url).pathname;
      request.headers = new Headers();
      request.body = undefined;
      raw = new Response(null, { status, headers: responseHeaders });
    }

    const effectiveRequest = finalRequest ?? request;
    const hookCtx: ResponseHookContext = {
      status,
      headers: responseHeaders,
      request: effectiveRequest,
      resource: resource.name,
      operation: op.name,
    };
    const sourceResponse: ApiResponse<unknown> = {
      data: source,
      source,
      status,
      headers: responseHeaders,
      request: effectiveRequest,
      raw,
    };

    const isJsonLike = responseType === "json" || responseType === "auto";
    const isEmptyBody = (status === 204 || status === 205) && source === null;
    const isAllowed404 = call.allow404 === true && status === 404;
    const skipHooks = isEmptyBody || isAllowed404;
    const declaredEmpty = op.emptyResponse === true && !isAllowed404;
    let response: ApiResponse<unknown>;

    try {
      if (declaredEmpty) {
        // `emptyResponse`: no body is expected, so nothing is unwrapped, transformed or shaped. A
        // mocked builtin still returns its record; the declared contract discards it.
        data = mocked || isEmptyBodyValue(data) ? undefined : data;
      } else if (!op.transfer) {
        if (!skipHooks && isJsonLike) {
          if (!mocked) {
            // Paginated operations decode the raw backend envelope (field paths address it), so a
            // configured `response.unwrap` does not apply to them; entities are then transformed
            // while the pagination metadata keys are left alone.
            if (paginationConfig) {
              const page = paginationConfig.parse(data, {
                status,
                headers: responseHeaders,
                request: {
                  method: effectiveRequest.method,
                  ...(call.params ? { params: call.params } : {}),
                  ...(effectiveRequest.query ? { query: effectiveRequest.query } : {}),
                  pagination: { ...(paginationRead?.logical ?? {}) },
                },
              });
              data = op.responseTransform
                ? { ...page, data: applyTransform(page.data, op.responseTransform) }
                : page;
            } else {
              if (op.responseUnwrap) {
                data = await waitForSignal(
                  applyUnwrap(data, op.responseUnwrap, hookCtx, sourceResponse),
                  signal,
                );
              }
              if (op.responseTransform) {
                if (call.paginated && isRecordValue(data) && Array.isArray(data.data)) {
                  data = { ...data, data: applyTransform(data.data, op.responseTransform) };
                } else {
                  data = applyTransform(data, op.responseTransform);
                }
              }
            }
          } else if (op.responseTransform) {
            if (call.paginated && isRecordValue(data) && Array.isArray(data.data)) {
              data = { ...data, data: applyTransform(data.data, op.responseTransform) };
            } else {
              data = applyTransform(data, op.responseTransform);
            }
          }

          if (op.responseParse) {
            try {
              data = await waitForSignal(Promise.resolve(op.responseParse(data, hookCtx)), signal);
            } catch (err) {
              if (err instanceof ApiError) throw err;
              throw new ValidationError(`${resource.name}.${op.name}: response.parse failed.`, {
                status,
                data: source,
                response: sourceResponse,
                cause: err,
              });
            }
          }
        }

        // Builtin normalization (count shapes, list / entity shaping, slice).
        if (!mocked && call.fromHttp && isJsonLike) {
          data = call.fromHttp(data, status, sourceResponse);
        }

        if (call.shape && isJsonLike) {
          data = call.shape(data);
        }

        if (!skipHooks && isJsonLike && op.responseValidate) {
          try {
            const validated = await waitForSignal(
              Promise.resolve(op.responseValidate(data, hookCtx)),
              signal,
            );
            if (validated !== undefined) data = validated;
          } catch (err) {
            if (err instanceof ApiError) throw err;
            throw new ValidationError(`${resource.name}.${op.name}: response.validate failed.`, {
              status,
              data: source,
              response: sourceResponse,
              cause: err,
            });
          }
        }
      }

      // Final logical response middleware: once, never for an intermediate retried response.
      response = {
        data,
        source,
        status,
        headers: responseHeaders,
        request: effectiveRequest,
        raw,
      };
      for (const hook of op.onResponse) {
        const next = await waitForSignal(Promise.resolve(hook(response)), signal);
        if (next !== undefined) {
          const prevSource = response.source;
          const checked = assertResponse(
            next,
            `response middleware for ${resource.name}.${op.name}`,
          );
          response = "source" in checked ? checked : { ...checked, source: prevSource };
        }
      }

      response = await finalizeOutput(response);
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err instanceof ResponseShapeError ||
          err instanceof ParseError ||
          err instanceof ValidationError ||
          err instanceof TransformError)
      ) {
        err.status ??= status;
        err.data ??= source;
        err.response ??= sourceResponse;
      }
      throw err;
    }
    throwIfAborted(signal);
    return options.full ? response : response.data;
  } catch (thrown) {
    // A stream already handed to this call is released if the call then fails (for example a
    // response middleware throws): cancelling it ends the connection and runs the cleanup.
    boundStream?.cancel(thrown).catch(() => {});
    if (delegated) {
      if (request) {
        request.url = "[presigned destination]";
        request.path = "[presigned destination]";
        request.headers = new Headers();
        request.body = undefined;
      }
      if (thrown instanceof ApiError) {
        thrown.message = "Presigned request failed.";
        thrown.stack = "Presigned request failed.";
        thrown.cause = undefined;
        thrown.data = undefined;
        thrown.response = undefined;
      } else thrown = new NetworkError("Presigned request failed.");
    }
    let error = classify(thrown, signal, timedOut(), request);
    const recoveryCheckpoint =
      error instanceof ApiError ? error.advancedTransfer?.checkpoint : undefined;
    const safeTransferReplay =
      !op.transfer ||
      (recoveryCheckpoint !== undefined &&
        !signal.aborted &&
        (error instanceof NetworkError || error instanceof HttpError));
    let replayResult: unknown;
    let replayFinished = false;
    const replay =
      call.replayed ||
      signal.aborted ||
      delegated ||
      call.replayAllowed === false ||
      !safeTransferReplay ||
      !isReplayable(request?.body) ||
      (!SAFE_REPLAY_METHODS.includes(request?.method ?? op.method) &&
        !op.transfer &&
        !op.idempotency &&
        !(
          options.retry !== undefined ? resolveRetryConfig(options.retry) : op.retry
        )?.methods.includes(request?.method ?? op.method))
        ? undefined
        : async () => {
            const result = await runOperation(client, resource, op, {
              ...call,
              replayed: true,
              idempotencyKey,
              // Same logical call: the replay keeps running against the original total deadline.
              deadline,
              ...(op.transfer
                ? {
                    options: {
                      ...options,
                      signal,
                      transfer: { ...options.transfer, checkpoint: recoveryCheckpoint },
                    },
                  }
                : {}),
            });
            replayResult = result;
            replayFinished = true;
            return result;
          };
    for (const hook of op.onError) {
      try {
        // Terminal abort/timeout hooks may observe the failure but cannot keep its budget alive.
        const work = Promise.resolve(hook(error, { request, replay }));
        if (signal.aborted) {
          void work.catch(() => {});
          continue;
        }
        const recovered = await waitForSignal(work, signal);
        if (recovered !== undefined) {
          if (replayFinished && recovered === replayResult) return recovered;
          if (options.full)
            return await finalizeOutput(assertResponse(recovered, "error middleware recovery"));
          const envelope: ApiResponse<unknown> = {
            data: recovered,
            status: error instanceof ApiError ? (error.status ?? 0) : 0,
            headers: new Headers(),
            request: request!,
          };
          return (await finalizeOutput(envelope)).data;
        }
      } catch (next) {
        error = next;
      }
    }
    throw error;
  } finally {
    if (!ownsCleanup) cleanup();
  }
}

/**
 * One key per logical call: an explicit `options.idempotencyKey`, else the key of the call being
 * replayed, else a header the caller already set, else a fresh one. Transport retries reuse the
 * request headers, so they reuse the key too.
 */
function applyIdempotency(
  op: PreparedOperation,
  options: RequestOptions,
  headers: Headers,
  current: string | undefined,
  resourceName: string,
): string | undefined {
  if (!op.idempotency) {
    if (options.idempotencyKey !== undefined) {
      throw new ConfigError(
        `resources.${resourceName}.operations.${op.name}: idempotencyKey was passed, but the operation has no idempotency option.`,
      );
    }
    return undefined;
  }
  const { header, generate } = op.idempotency;
  if (options.idempotencyKey !== undefined) {
    if (typeof options.idempotencyKey !== "string" || options.idempotencyKey === "") {
      throw new ConfigError("options.idempotencyKey must be a non-empty string.");
    }
    headers.set(header, options.idempotencyKey);
    return options.idempotencyKey;
  }
  if (current !== undefined) {
    headers.set(header, current);
    return current;
  }
  const existing = headers.get(header);
  if (existing !== null) return existing;
  const key = generate();
  if (typeof key !== "string" || key === "") {
    throw new ConfigError(
      `resources.${resourceName}.operations.${op.name}.idempotency.generate must return a non-empty string.`,
    );
  }
  headers.set(header, key);
  return key;
}

function serializeCustomQuery(
  serializer: (query: QueryParams) => string,
  query: QueryParams,
): string {
  let out: unknown;
  try {
    out = serializer(query);
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    throw new SerializationError(
      "Custom querySerializer failed to encode query parameters.",
      { path: "$" },
      { cause },
    );
  }
  if (typeof out !== "string") {
    throw new SerializationError("Custom querySerializer must return a string.", { path: "$" });
  }
  return out;
}

function normalizeQs(value: string): string {
  if (!value) return "";
  return value.startsWith("?") ? value : `?${value}`;
}

function isReplayable(body: unknown): boolean {
  return !(typeof ReadableStream !== "undefined" && body instanceof ReadableStream);
}

interface SendInput {
  client: ClientRuntime;
  op: PreparedOperation;
  request: ApiRequest;
  wireBody: unknown;
  options: RequestOptions;
  signal: AbortSignal;
  allow404: boolean;
  responseType: ResponseType;
  session: TransferSession;
  limits: { maxResponseBytes?: number; accept?: readonly string[] } | undefined;
  limitState: { error?: ValidationError };
  redirectOrigins: readonly string[] | undefined;
  /** Budget of one transport attempt in ms (absent / 0 → unbounded). */
  perAttempt: number | undefined;
  /** Absolute total deadline of the logical call (epoch ms). */
  deadline: number | undefined;
  idempotencyKey: string | undefined;
}

/**
 * Transport attempts for one logical call. Retries happen only here: logical middleware and
 * header providers never re-run; `onAttempt` / `onAttemptResponse` run for every attempt. The
 * total deadline and caller cancellation stop attempts and backoff; a per-attempt deadline ends
 * one attempt and may be retried.
 */
async function sendWithRetry(input: SendInput) {
  const { client, op, request, options, signal, session, limits, limitState } = input;
  const retry =
    options.retry !== undefined ? resolveRetryConfig(options.retry, "options.retry") : op.retry;
  const baseHeaders = new Headers(request.headers);
  const body = serializeBody(input.wireBody, baseHeaders, {
    dataFormat: op.dataFormat,
    multipart: op.multipart,
  });
  const replayable = isReplayable(body);
  // Attempt hooks belong to the API's own requests: a presigned destination never sees them.
  const onAttempt = request.delegated ? [] : op.onAttempt;
  const onAttemptResponse = request.delegated ? [] : op.onAttemptResponse;
  const where = `${request.resource}.${request.operation}`;
  let hookRetryUsed = false;

  for (let attempt = 0; ; attempt++) {
    throwIfAborted(signal);
    let failure: ApiError;
    let failedResponse: ApiResponse<unknown> | undefined;
    let headers = baseHeaders;
    let attemptRequest = request;
    if (onAttempt.length > 0 || onAttemptResponse.length > 0) {
      // Every attempt starts from the logical request's headers: a token or signature set for one
      // attempt is never carried into the next.
      attemptRequest = { ...request, headers: new Headers(baseHeaders) };
      const bodyUnchanged = unchanged(request.body);
      const queryUnchanged = unchanged(request.query);
      for (const hook of onAttempt) {
        await waitForSignal(Promise.resolve(hook({ request: attemptRequest, attempt })), signal);
        throwIfAborted(signal);
      }
      if (
        attemptRequest.url !== request.url ||
        attemptRequest.method !== request.method ||
        attemptRequest.body !== request.body ||
        !bodyUnchanged() ||
        !queryUnchanged() ||
        attemptRequest.query !== request.query ||
        attemptRequest.signal !== signal
      ) {
        throw new ConfigError(
          `onAttempt middleware for ${where} may only change headers; the method, URL and body belong to the logical request (use onRequest).`,
        );
      }
      if (!(attemptRequest.headers instanceof Headers)) {
        throw new ConfigError(
          `onAttempt middleware for ${where} left a request whose headers is not a Headers instance.`,
        );
      }
      if (
        op.idempotency &&
        input.idempotencyKey !== undefined &&
        attemptRequest.headers.get(op.idempotency.header) !== input.idempotencyKey
      ) {
        throw new ConfigError(
          `onAttempt middleware for ${where} changed the ${op.idempotency.header} header. The idempotency key must stay stable across attempts.`,
        );
      }
      headers = attemptRequest.headers;
    }
    const channel = nextChannel(session, attempt);
    const attemptSignal = createAttemptSignal(signal, input.perAttempt);
    let retryRequested = false;
    try {
      let response;
      try {
        response = await waitForSignal(
          client.transport.request({
            url: request.url,
            method: request.method,
            headers,
            body,
            signal: attemptSignal.signal,
            responseType: input.responseType,
            ...(request.delegated
              ? { security: { credentials: "omit" as const, redirect: "error" as const } }
              : {}),
            ...(limits ? { limits } : {}),
            ...(input.redirectOrigins?.length && !request.delegated
              ? { redirectOrigins: input.redirectOrigins }
              : {}),
            ...(channel ? { onTransfer: channel.sink } : {}),
          }),
          attemptSignal.signal,
        );
      } finally {
        attemptSignal.clear();
      }
      channel?.finishRequest(body !== null && body !== undefined);
      if (onAttemptResponse.length > 0) {
        const context = {
          request: attemptRequest,
          attempt,
          response: { status: response.status, headers: response.headers, data: response.body },
          retry: () => {
            retryRequested = true;
          },
        };
        for (const hook of onAttemptResponse) {
          await waitForSignal(Promise.resolve(hook(context)), signal);
          throwIfAborted(signal);
        }
      }
      if (
        (response.status >= 200 && response.status < 300) ||
        (input.allow404 && response.status === 404)
      ) {
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
      if (signal.aborted) {
        failFromSignal(channel, signal);
        throw error;
      }
      if (error instanceof ConfigError) throw error;
      failure =
        limitState.error ??
        (attemptSignal.timedOut()
          ? new TimeoutError(`Attempt timed out after ${input.perAttempt}ms`, { cause: error })
          : error instanceof ApiError
            ? error
            : new NetworkError(error instanceof Error ? error.message : "Network request failed", {
                cause: error,
              }));
      failure.request ??= request;
      failure.attempt = attempt;
    }

    const ctx = {
      request,
      response: failedResponse,
      attempt,
      method: request.method,
      error: failure,
    };
    // A hook-requested attempt (for example after a token refresh on 401): at most one per
    // logical call, only for a replayable body, and never for an unsafe write.
    const hookRetry =
      retryRequested &&
      !hookRetryUsed &&
      replayable &&
      !signal.aborted &&
      (SAFE_REPLAY_METHODS.includes(request.method) ||
        retry?.methods.includes(request.method) === true ||
        input.idempotencyKey !== undefined);
    const retryAfter =
      retry?.respectRetryAfter && failedResponse
        ? parseRetryAfter(failedResponse.headers.get("retry-after"))
        : undefined;
    const remaining = input.deadline !== undefined ? input.deadline - Date.now() : Infinity;
    const canRetry =
      hookRetry ||
      (retry !== undefined &&
        replayable &&
        (failure instanceof NetworkError ||
          failure instanceof TimeoutError ||
          failure instanceof HttpError) &&
        retry.methods.includes(request.method) &&
        !signal.aborted &&
        decideRetry(retry, ctx, failure) &&
        // A server hint longer than the cap or than what is left of the total budget is not waited for.
        (retryAfter === undefined || (retryAfter <= retry.maxDelay && retryAfter < remaining)));
    failure.retryable = canRetry;
    if (request.delegated) {
      failure.message = "Presigned request failed.";
      failure.stack = "Presigned request failed.";
      failure.cause = undefined;
      failure.data = undefined;
      failure.response = undefined;
      failure.request = {
        ...request,
        url: "[presigned destination]",
        path: "[presigned destination]",
        headers: new Headers(),
        body: undefined,
      };
    }
    channel?.fail({ kind: "error", error: failure, willRetry: canRetry });
    if (!canRetry) throw failure;
    if (hookRetry) {
      hookRetryUsed = true;
      continue;
    }

    await waitForSignal(Promise.resolve(retry!.onRetry?.(ctx)), signal);
    await delay(retryAfter ?? computeBackoffMs(attempt, retry!), signal);
  }
}
