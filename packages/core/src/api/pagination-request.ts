import type {
  LogicalPaginationInput,
  PaginationParams,
  PaginationStrategy,
} from "../types/definition.js";
import type { ResolvedPagination } from "./pagination.js";

type Row = Record<string, unknown>;
type Fail = (message: string) => never;

/** Logical request keys each strategy owns (`before` only counts once it is mapped). */
const LOGICAL_KEYS: Record<PaginationStrategy, readonly (keyof LogicalPaginationInput)[]> = {
  page: ["page", "pageSize"],
  offset: ["offset", "pageSize"],
  cursor: ["cursor", "before", "pageSize"],
};
/** SDK-owned request keys of a pagination strategy (never application query fields). */
export function logicalQueryKeys(mode: PaginationStrategy): readonly string[] {
  return LOGICAL_KEYS[mode];
}
/** Logical pagination keys plus any mapped backend query parameter names for this configuration. */
export function controlQueryKeys(
  resolved: Pick<ResolvedPagination, "mode" | "params">,
): readonly string[] {
  const keys = new Set<string>(LOGICAL_KEYS[resolved.mode]);
  for (const key of LOGICAL_KEYS[resolved.mode]) {
    const wire = resolved.params?.[key as keyof PaginationParams];
    if (wire !== undefined) keys.add(wire);
  }
  return [...keys];
}
const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const HEADER_VALUE_FORBIDDEN = /[\r\n\0]/;

function isPlain(value: unknown): value is Row {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Null-prototype copy: writes by arbitrary wire names can never reach `Object.prototype`. */
function safeAssign(target: Row, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function integer(raw: unknown, min: number): number | undefined {
  if (typeof raw === "number") return Number.isInteger(raw) && raw >= min ? raw : undefined;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = Number(raw);
    return Number.isSafeInteger(n) && n >= min ? n : undefined;
  }
  return undefined;
}

export interface LogicalRead {
  /** Validated, coerced logical values (defaults applied). */
  logical: LogicalPaginationInput;
  /** Everything that is not a logical pagination key (a copy; the input is never mutated). */
  rest: Row;
}

/**
 * Validate the logical pagination values found in `query` and detect ambiguity. Used by live and
 * mocked calls alike, so both reject the same inputs. Values never appear in error messages
 * (cursors are untrusted and may be sensitive).
 *
 * Detection boundary: values present in `query` when this runs. Anything custom middleware or a
 * custom serializer rewrites afterwards is out of reach (see `assertNoWireCollision`).
 */
export function readLogicalPagination(
  resolved: Pick<
    ResolvedPagination,
    "mode" | "params" | "defaultPageSize" | "maxPageSize" | "buildRequest"
  >,
  query: Row | undefined,
  fail: Fail,
  options: { numericCursor?: boolean } = {},
): LogicalRead {
  const logical: LogicalPaginationInput = {};
  const rest: Row = {};
  const owned = new Set<string>(LOGICAL_KEYS[resolved.mode]);
  const source = query ?? {};
  for (const key of Object.keys(source)) {
    if (!owned.has(key)) safeAssign(rest, key, source[key]);
  }
  for (const key of LOGICAL_KEYS[resolved.mode]) {
    const raw = source[key];
    if (raw === undefined || raw === null || raw === "") continue;
    switch (key) {
      case "page": {
        const n = integer(raw, 1);
        if (n === undefined) fail("pagination `page` must be a positive integer.");
        logical.page = n;
        break;
      }
      case "pageSize": {
        const n = integer(raw, 1);
        if (n === undefined) fail("pagination `pageSize` must be a positive integer.");
        if (resolved.maxPageSize !== undefined && n > resolved.maxPageSize) {
          fail(
            `pagination \`pageSize\` exceeds the configured maxPageSize (${resolved.maxPageSize}).`,
          );
        }
        logical.pageSize = n;
        break;
      }
      case "offset": {
        const n = integer(raw, 0);
        if (n === undefined) fail("pagination `offset` must be a non-negative integer.");
        logical.offset = n;
        break;
      }
      default: {
        // `cursor` / `before`: opaque strings, preserved exactly.
        const value =
          typeof raw === "string"
            ? raw
            : options.numericCursor && typeof raw === "number"
              ? String(raw)
              : undefined;
        if (value === undefined) fail(`pagination \`${key}\` must be a string.`);
        (logical as Record<string, unknown>)[key] = value;
      }
    }
  }
  if (logical.cursor !== undefined && logical.before !== undefined) {
    fail("pagination `cursor` and `before` cannot be combined.");
  }
  if (logical.before !== undefined && !resolved.buildRequest && !resolved.params?.before) {
    fail("pagination `before` needs a backend name: set `params.before` or use `buildRequest`.");
  }
  // A configured backend name already present beside its logical name is ambiguous.
  for (const key of Object.keys(logical) as (keyof LogicalPaginationInput)[]) {
    const wire = resolved.params?.[key as keyof PaginationParams];
    if (wire !== undefined && wire !== key && Object.hasOwn(rest, wire)) {
      fail(
        `pagination \`${key}\` maps to backend name "${wire}", which is also present in the request; send one of them.`,
      );
    }
  }
  if (logical.pageSize === undefined && resolved.defaultPageSize !== undefined) {
    const wire = resolved.params?.pageSize ?? "pageSize";
    // An explicit backend-named value wins over a default (a default is never a second opinion).
    if (!Object.hasOwn(rest, wire)) logical.pageSize = resolved.defaultPageSize;
  }
  return { logical, rest };
}

export interface LiveRequestParts {
  query: Row;
  /** Wire query keys contributed by pagination (`params` or `buildRequest`). */
  paginationQuery: Row;
  /** Present only when `buildRequest` contributed a body. */
  body?: unknown;
  bodyChanged: boolean;
  headers?: Record<string, string>;
}

/**
 * Turn validated logical values into the live request. Configured backend names are used verbatim
 * (key transforms do not rewrite them); unmapped logical names go through `transform` like any
 * other query key. A transformed key that lands on a configured backend name is a collision.
 */
export function buildLivePaginationRequest(
  resolved: Pick<ResolvedPagination, "params" | "pageBase" | "buildRequest">,
  read: LogicalRead,
  ctx: {
    method: string;
    body: unknown;
    hasBody: boolean;
    transform: (query: Row) => Row;
    fail: Fail;
  },
): LiveRequestParts {
  const { logical, rest } = read;
  const { fail } = ctx;
  if (resolved.buildRequest) {
    const returned: unknown = resolved.buildRequest(
      { ...logical },
      { method: ctx.method, query: { ...rest }, body: ctx.body },
    );
    if (!isPlain(returned))
      fail("pagination `buildRequest` must return { query?, body?, headers? }.");
    const parts = returned as { query?: Row; body?: unknown; headers?: unknown };
    const query: Row = ctx.transform(rest);
    const paginationQuery: Row = Object.create(null) as Row;
    for (const [key, value] of Object.entries(parts.query ?? {})) {
      if (UNSAFE.has(key)) fail(`pagination request name "${key}" is not allowed.`);
      if (Object.hasOwn(query, key) || Object.hasOwn(rest, key)) {
        fail(
          `pagination \`buildRequest\` query name "${key}" collides with an existing query value.`,
        );
      }
      safeAssign(query, key, value);
      safeAssign(paginationQuery, key, value);
    }
    let body = ctx.body;
    let bodyChanged = false;
    if (parts.body !== undefined) {
      if (!ctx.hasBody)
        fail("pagination `buildRequest` returned a body for an operation without one.");
      if (!isPlain(parts.body)) fail("pagination `buildRequest` body must be a plain object.");
      if (body === undefined || body === null) {
        body = { ...parts.body };
      } else if (isPlain(body)) {
        const merged: Row = { ...body };
        for (const [key, value] of Object.entries(parts.body as Row)) {
          if (UNSAFE.has(key)) fail(`pagination request name "${key}" is not allowed.`);
          if (Object.hasOwn(merged, key)) {
            fail(
              `pagination \`buildRequest\` body field "${key}" collides with an existing body field.`,
            );
          }
          safeAssign(merged, key, value);
        }
        body = merged;
      } else {
        fail("pagination cannot be placed in a request body that is not a plain object.");
      }
      bodyChanged = true;
    }
    let headers: Record<string, string> | undefined;
    if (parts.headers !== undefined) {
      if (!isPlain(parts.headers)) fail("pagination `buildRequest` headers must be an object.");
      headers = {};
      for (const [name, value] of Object.entries(parts.headers as Row)) {
        if (
          !HEADER_NAME.test(name) ||
          typeof value !== "string" ||
          HEADER_VALUE_FORBIDDEN.test(value)
        ) {
          fail(`pagination \`buildRequest\` returned an invalid header "${name}".`);
        }
        safeAssign(headers, name, value);
      }
    }
    return {
      query,
      paginationQuery,
      bodyChanged,
      ...(bodyChanged ? { body } : {}),
      ...(headers ? { headers } : {}),
    };
  }

  const passthrough: Row = { ...rest };
  const mapped: Row = Object.create(null) as Row;
  const paginationQuery: Row = Object.create(null) as Row;
  for (const key of Object.keys(logical) as (keyof LogicalPaginationInput)[]) {
    let value: unknown = logical[key];
    if (key === "page") value = (value as number) - 1 + resolved.pageBase;
    const wire = resolved.params?.[key as keyof PaginationParams];
    if (wire !== undefined) {
      safeAssign(mapped, wire, value);
      safeAssign(paginationQuery, wire, value);
    } else {
      safeAssign(passthrough, key, value);
      const transformedKey = Object.keys(ctx.transform({ [key]: value }))[0] ?? key;
      safeAssign(paginationQuery, transformedKey, value);
    }
  }
  const transformed = ctx.transform(passthrough);
  const query: Row = {};
  for (const key of Object.keys(transformed)) safeAssign(query, key, transformed[key]);
  for (const key of Object.keys(mapped)) {
    if (Object.hasOwn(query, key)) {
      fail(
        `pagination backend name "${key}" collides with another query value after key transformation.`,
      );
    }
    safeAssign(query, key, mapped[key]);
  }
  return { query, paginationQuery, bodyChanged: false };
}

/**
 * Last observable point before dispatch: after request middleware, the structured query and any
 * query already in the URL are merged. A configured backend name present in both is ambiguous.
 */
export function assertNoWireCollision(
  resolved: Pick<ResolvedPagination, "params" | "mode">,
  structured: Row | undefined,
  fromUrl: Row,
  fail: Fail,
): void {
  for (const key of LOGICAL_KEYS[resolved.mode]) {
    const wire = resolved.params?.[key as keyof PaginationParams];
    if (wire === undefined) continue;
    if (Object.hasOwn(fromUrl, wire) && structured && Object.hasOwn(structured, wire)) {
      fail(`pagination backend name "${wire}" is set both in the URL and in the request query.`);
    }
    // Middleware added the logical name beside the mapped backend name.
    if (
      wire !== key &&
      structured &&
      Object.hasOwn(structured, key) &&
      Object.hasOwn(structured, wire)
    ) {
      fail(`pagination \`${key}\` and its backend name "${wire}" are both set on the request.`);
    }
  }
}

/** Mocked calls: validate the logical input exactly like live calls and return it with defaults applied. */
export function normalizeMockPagination(
  resolved: Pick<
    ResolvedPagination,
    "mode" | "params" | "defaultPageSize" | "maxPageSize" | "buildRequest"
  >,
  query: Row | undefined,
  fail: Fail,
): Row {
  const { logical, rest } = readLogicalPagination(resolved, query, fail, { numericCursor: true });
  return { ...rest, ...logical };
}

/** Recover logical pagination keys after request transforms, including configured wire aliases. */
export function normalizePaginationKeys(
  query: Row | undefined,
  resolved: ResolvedPagination,
  transform: (key: string) => string,
): Row | undefined {
  if (!query) return query;
  const aliases = new Map<string, string>();
  for (const key of LOGICAL_KEYS[resolved.mode]) {
    aliases.set(transform(key), key);
    const wire = resolved.params?.[key as keyof PaginationParams];
    if (wire) aliases.set(wire, key);
  }
  return Object.fromEntries(
    Object.entries(query).map(([key, value]) => [aliases.get(key) ?? key, value]),
  );
}
