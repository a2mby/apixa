import { MockError } from "../errors/index.js";
import type { BuiltinConventionName } from "../operation/conventions.js";
import type { MockStore } from "./store.js";
import type { MockSource, Row } from "./source.js";

export type PaginationMode = "page" | "cursor" | "offset";

export type MockResult = { status: number; data: unknown };

/** Arguments a builtin call resolved to, independent of HTTP wire shape. */
export interface BuiltinIntent {
  op: BuiltinConventionName;
  id?: unknown;
  ids?: unknown;
  field?: string;
  value?: unknown;
  query?: Record<string, unknown>;
  body?: unknown;
}

const DEFAULT_PAGE_SIZE = 20;

function positiveInt(
  store: string,
  name: string,
  raw: unknown,
  fallback: number,
  min: number,
): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < min) {
    throw new MockError(
      "MOCK_INVALID_INPUT",
      `${store}: ${name} must be an integer >= ${min} (got ${String(raw)})`,
    );
  }
  return n;
}

/**
 * Slice rows into the normalized contract for `mode`. `copy` runs only on the returned window.
 * Mock cursors are decimal row indexes: a documented mock format, not a model of any backend's
 * opaque cursors, ordering guarantees or snapshot behaviour. Mocks are forward-only (no
 * `previousCursor`) and report a fixed total.
 */
function slicePage(
  label: string,
  rows: readonly unknown[],
  mode: PaginationMode,
  query: Record<string, unknown>,
  copy: (rows: readonly unknown[]) => unknown[],
): unknown {
  const pageSize = positiveInt(label, "pageSize", query.pageSize, DEFAULT_PAGE_SIZE, 1);
  if (mode === "page") {
    const page = positiveInt(label, "page", query.page, 1, 1);
    const start = (page - 1) * pageSize;
    return { data: copy(rows.slice(start, start + pageSize)), total: rows.length, page, pageSize };
  }
  if (mode === "offset") {
    const offset = positiveInt(label, "offset", query.offset, 0, 0);
    const end = offset + pageSize;
    return {
      data: copy(rows.slice(offset, end)),
      total: rows.length,
      offset,
      pageSize,
      nextOffset: end < rows.length ? end : null,
    };
  }
  const start = positiveInt(label, "cursor", query.cursor, 0, 0);
  const end = start + pageSize;
  return {
    data: copy(rows.slice(start, end)),
    nextCursor: end < rows.length ? String(end) : null,
  };
}

/** Paginate an unpaginated collection (a custom mock handler's array) into the normalized contract. */
export function paginateList(
  label: string,
  rows: readonly unknown[],
  mode: PaginationMode,
  query: Record<string, unknown> = {},
): unknown {
  return slicePage(label, rows, mode, query, (r) => [...r]);
}

/**
 * Select the page window over rows held by reference, then copy only what is returned. Without
 * pagination the whole selection is returned (and so copied).
 */
function paginate(
  store: MockStore,
  label: string,
  rows: readonly Row[],
  mode: PaginationMode | undefined,
  query: Record<string, unknown> = {},
): unknown {
  if (!mode) return store.cloneRows(rows);
  return slicePage(label, rows, mode, query, (r) => store.cloneRows(r as readonly Row[]));
}

/** Run one builtin straight against the store — never through another builtin. */
export async function runBuiltin(
  store: MockStore,
  source: MockSource,
  intent: BuiltinIntent,
  pagination: PaginationMode | undefined,
): Promise<MockResult> {
  await store.ready();
  const q = intent.query;
  switch (intent.op) {
    case "getAll":
      return { status: 200, data: paginate(store, source.label, store.select(q), pagination, q) };
    case "getById":
      return { status: 200, data: store.get(intent.id) };
    case "getMany":
      return {
        status: 200,
        data: paginate(store, source.label, store.getMany(intent.ids), pagination, q),
      };
    case "getBy":
      return { status: 200, data: store.getBy(intent.field!, intent.value) };
    case "findFirst":
      return { status: 200, data: store.findFirst(q) };
    case "exists":
      return { status: 200, data: store.exists(intent.id) };
    case "count":
      return { status: 200, data: store.count(q) };
    case "create":
      return { status: 201, data: store.create(intent.body) };
    case "update":
      return { status: 200, data: store.update(intent.id, intent.body) };
    case "patch":
      return { status: 200, data: store.patch(intent.id, intent.body) };
    case "delete":
      store.delete(intent.id);
      return { status: 204, data: null };
    case "createMany":
      return { status: 201, data: store.createMany(intent.body) };
    case "deleteMany":
      store.deleteMany(intent.body);
      return { status: 204, data: null };
  }
}

/**
 * Simulate a request issued through `ctx.request()` or a declarative custom operation on a
 * mocked resource. `relativePath` is already interpolated and relative to the resource path.
 * Anything outside the resource conventions is a `MOCK_UNSUPPORTED` error — never HTTP.
 */
export function routeToIntent(
  method: string,
  relativePath: string,
  query: Record<string, unknown> | undefined,
  body: unknown,
  label: string,
): BuiltinIntent {
  if (/^[a-z][a-z0-9+.-]*:/i.test(relativePath)) {
    throw new MockError(
      "MOCK_UNSUPPORTED",
      `${label}: cannot simulate absolute URL "${relativePath}" on a mocked resource`,
    );
  }
  const path = relativePath.split("?")[0]!.replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean).map(decodeURIComponent);
  const m = method.toUpperCase();

  if (segments.length === 0) {
    if (m === "GET") return { op: "getAll", query };
    if (m === "POST") return { op: "create", body };
  } else if (segments.length === 1) {
    const [seg] = segments as [string];
    if (seg === "count" && m === "GET") return { op: "count", query };
    if (seg === "bulk" && m === "POST") return { op: "createMany", body };
    if (seg === "bulk" && m === "DELETE") return { op: "deleteMany", body };
    if (m === "GET") return { op: "getById", id: seg };
    if (m === "PUT") return { op: "update", id: seg, body };
    if (m === "PATCH") return { op: "patch", id: seg, body };
    if (m === "DELETE") return { op: "delete", id: seg };
  }
  throw new MockError(
    "MOCK_UNSUPPORTED",
    `${label}: cannot simulate ${m} "${relativePath || "/"}" against in-memory records. ` +
      `Supported: GET/POST "", GET/PUT/PATCH/DELETE "/:id", GET "/count", POST/DELETE "/bulk".`,
  );
}
