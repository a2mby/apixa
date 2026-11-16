import type { PaginationStrategy } from "../types/definition.js";

/**
 * Outcome of building a continuation. It answers two separate questions:
 *
 * - `available`: is another page *known* to exist? `true` / `false` / `undefined` (unknown).
 * - `input`: does Apixa hold enough information to *construct* the request? Present only if so.
 *
 * `available: true` without `input` means the backend reported more data but gave no usable
 * continuation. `available: undefined` with an `input` means "unknown, but trying is well defined"
 * (for example a page backend that reports no total: the next page may simply be empty).
 */
interface NavigationResult<I> {
  available: boolean | undefined;
  input?: I;
  /** Why the continuation is unavailable / unknown / not constructible. Never contains cursor values. */
  reason?: string;
}

export type PaginationNavigation<I> = I | null;

type CallInput = { query?: Record<string, unknown> } & Record<string, unknown>;
type Loose = Record<string, unknown> & { data?: unknown };

const NAV_KEYS = ["page", "offset", "cursor", "before"];

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** A copy of `input` whose `query` has `set` applied and `drop` removed; everything else is untouched. */
function withQuery<I extends CallInput>(
  input: I | undefined,
  set: Record<string, unknown>,
  drop: readonly string[] = [],
): I {
  const nested = input?.pagination !== undefined;
  const query: Record<string, unknown> = {
    ...(((nested ? input?.pagination : input?.query) as Record<string, unknown>) ?? {}),
  };
  for (const key of drop) delete query[key];
  for (const [key, value] of Object.entries(set)) query[key] = value;
  return { ...(input ?? {}), [nested ? "pagination" : "query"]: query } as I;
}

function rows(result: Loose): number {
  return Array.isArray(result.data) ? result.data.length : 0;
}

function pageDirection<I extends CallInput>(
  dir: 1 | -1,
  result: Loose,
  input: I | undefined,
): NavigationResult<I> {
  const page = num(result.page);
  if (page === undefined) return { available: undefined, reason: "The result has no page number." };
  if (dir === -1) {
    return page > 1
      ? { available: true, input: withQuery(input, { page: page - 1 }) }
      : { available: false, reason: "This is the first page." };
  }
  const pageSize = num(result.pageSize);
  const total = num(result.total);
  const pageCount = num(result.pageCount);
  // Precedence: an explicit `hasMore`, then `pageCount`, then `total` with the reported page size.
  let more: boolean | undefined;
  if (typeof result.hasMore === "boolean") more = result.hasMore;
  else if (pageCount !== undefined) more = page < pageCount;
  else if (total !== undefined && pageSize !== undefined) more = page * pageSize < total;
  if (more === false) return { available: false, reason: "This is the last page." };
  return {
    available: more,
    input: withQuery(input, { page: page + 1 }),
    ...(more === undefined
      ? {
          reason:
            "The backend does not say whether another page exists; the next page may be empty.",
        }
      : {}),
  };
}

function offsetDirection<I extends CallInput>(
  dir: 1 | -1,
  result: Loose,
  input: I | undefined,
): NavigationResult<I> {
  const offset = num(result.offset);
  if (offset === undefined) {
    return { available: undefined, reason: "The result has no offset." };
  }
  if (dir === -1) {
    if (result.previousOffset === null) {
      return { available: false, reason: "The backend reports no previous window." };
    }
    const explicit = num(result.previousOffset);
    if (explicit !== undefined)
      return { available: true, input: withQuery(input, { offset: explicit }) };
    if (offset === 0) return { available: false, reason: "This is the first window." };
    const size = num(result.pageSize);
    if (size === undefined || size < 1) {
      return {
        available: true,
        reason: "A previous window exists, but the result reports no page size to step back by.",
      };
    }
    return { available: true, input: withQuery(input, { offset: Math.max(0, offset - size) }) };
  }
  if (result.nextOffset === null || result.hasMore === false) {
    return { available: false, reason: "The backend reports no further rows." };
  }
  const explicit = num(result.nextOffset);
  if (explicit !== undefined)
    return { available: true, input: withQuery(input, { offset: explicit }) };
  // No explicit continuation: only continue past the rows actually returned, and only when the total says rows remain.
  const total = num(result.total);
  const end = offset + rows(result);
  if (total !== undefined) {
    if (end >= total) return { available: false, reason: "All rows have been returned." };
    if (rows(result) > 0) return { available: true, input: withQuery(input, { offset: end }) };
  }
  return {
    available: result.hasMore === true ? true : undefined,
    reason: "The backend supplied no next offset, so a continuation cannot be built safely.",
  };
}

function cursorDirection<I extends CallInput>(
  dir: 1 | -1,
  result: Loose,
  input: I | undefined,
  previousKey: "before" | "cursor",
): NavigationResult<I> {
  const value = dir === 1 ? result.nextCursor : result.previousCursor;
  if (typeof value === "string") {
    // Cursors are opaque: passed back exactly as received.
    const key = dir === 1 ? "cursor" : previousKey;
    return {
      available: true,
      input: withQuery(input, { [key]: value }, key === "cursor" ? ["before"] : ["cursor"]),
    };
  }
  if (value === null) {
    return { available: false, reason: dir === 1 ? "No further cursor." : "No previous cursor." };
  }
  if (dir === 1) {
    if (result.hasMore === false)
      return { available: false, reason: "The backend reports no more data." };
    if (result.hasMore === true) {
      return {
        available: true,
        reason: "The backend reports more data but supplied no continuation cursor.",
      };
    }
  }
  return {
    available: undefined,
    reason:
      dir === 1
        ? "The result carries no continuation cursor."
        : "This result carries no previous cursor (forward-only or not reported).",
  };
}

export interface PaginationNavOptions {
  /**
   * Cursor strategy, previous direction: which request key receives `previousCursor`. Default
   * `"before"` (needs `params.before`). Laravel's `prev_cursor` is sent back as `cursor`.
   */
  previousKey?: "before" | "cursor";
}

function navigate<I extends CallInput>(
  dir: 1 | -1,
  strategy: PaginationStrategy,
  result: unknown,
  input: I | undefined,
  options: PaginationNavOptions | undefined,
): NavigationResult<I> {
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    return { available: undefined, reason: "Not a paginated result." };
  }
  const loose = result as Loose;
  if (strategy === "page") return pageDirection(dir, loose, input);
  if (strategy === "offset") return offsetDirection(dir, loose, input);
  return cursorDirection(dir, loose, input, options?.previousKey ?? "before");
}

/**
 * Build the input for the next page **without sending anything**. `input` is the call input that
 * produced `result` (for example `{ query: { category: "books", page: 1 } }`); it is never mutated
 * and every key except the pagination ones is carried over.
 *
 * A continuation is only valid for the filters, sorting and body it was issued for: compare
 * {@link paginationContextKey} before reusing one after any of those change. For POST / PUT /
 * PATCH / DELETE operations, repeating the call is not necessarily safe; the endpoint's author
 * owns those semantics.
 */
export function nextPageInput<I extends CallInput>(
  strategy: PaginationStrategy,
  result: unknown,
  input?: I,
): PaginationNavigation<I> {
  const nav = navigate(1, strategy, result, input, undefined);
  return nav.available === true ? (nav.input ?? null) : null;
}

/** Build the input for the previous page (see {@link nextPageInput}). */
export function previousPageInput<I extends CallInput>(
  strategy: PaginationStrategy,
  result: unknown,
  input?: I,
  options?: PaginationNavOptions,
): PaginationNavigation<I> {
  const nav = navigate(-1, strategy, result, input, options);
  return nav.available === true ? (nav.input ?? null) : null;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = stable((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * A string identifying everything a continuation depends on except the position itself: path
 * `params`, query filters / sorting, and `body`. Equal keys mean a continuation can be reused;
 * different keys mean it must be discarded (and the position restarted). Page size is part of the
 * key. Inputs must be JSON-serializable for the key to be meaningful.
 */
export function paginationContextKey(input: CallInput | undefined): string {
  const query: Record<string, unknown> = { ...(input?.query ?? {}) };
  for (const key of NAV_KEYS) delete query[key];
  return JSON.stringify(stable({ params: input?.params, query, body: input?.body }));
}
