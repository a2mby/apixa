import type { TransportRequest } from "@apixa/core";
import { mockResponse } from "./response.js";
import type { Dataset } from "./types.js";

export type MockStore = {
  path: string;
  idField: string;
  records: Record<string, unknown>[];
  nextId: number;
  size?: number;
  pagination?: boolean;
};

export function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

export function cloneRecords(records: Record<string, unknown>[]): Record<string, unknown>[] {
  return records.map((row) => ({ ...row }));
}

export function parseBody(input: TransportRequest): Record<string, unknown> {
  if (input.body == null || input.body === "") return {};
  if (typeof input.body === "string") {
    try {
      const parsed = JSON.parse(input.body) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function maxNumericId(records: Record<string, unknown>[], idField: string): number {
  let max = 0;
  for (const row of records) {
    const value = row[idField];
    const n = typeof value === "number" ? value : Number(String(value));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

export function buildStore(
  dataset: Dataset,
  options: { path?: string; size?: number; pagination?: boolean } = {},
): MockStore {
  const idField = dataset.meta.resource.idField ?? "id";
  const records = cloneRecords(dataset.records);
  return {
    path: normalizePath(options.path ?? dataset.meta.resource.path),
    idField,
    records,
    nextId: maxNumericId(records, idField) + 1,
    size: options.size,
    pagination: options.pagination,
  };
}

export function findStore(
  stores: MockStore[],
  pathname: string,
): { store: MockStore; id?: string } | null {
  const path = normalizePath(pathname);

  for (const store of stores) {
    if (path === store.path) {
      return { store };
    }
    if (path.startsWith(`${store.path}/`)) {
      const rest = path.slice(store.path.length + 1);
      if (rest && !rest.includes("/")) {
        return { store, id: decodeURIComponent(rest) };
      }
    }
  }

  return null;
}

function visibleRecords(store: MockStore): Record<string, unknown>[] {
  if (typeof store.size === "number" && store.size >= 0) {
    return store.records.slice(0, store.size);
  }
  return store.records;
}

function parsePageParams(url: URL): { page: number; pageSize: number } {
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(url.searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.floor(pageSizeRaw) : 20;
  return { page, pageSize };
}

/** Handle a CRUD request against an in-memory store. */
export function handleStoreRequest(store: MockStore, input: TransportRequest, url: URL) {
  const match = findStore([store], url.pathname);
  if (!match) {
    return mockResponse(404, { message: `No mock store for ${url.pathname}` });
  }

  const itemId = match.id;
  const method = input.method.toUpperCase();

  if (method === "GET" && itemId === undefined) {
    const all = visibleRecords(store);
    if (store.pagination) {
      const { page, pageSize } = parsePageParams(url);
      const start = (page - 1) * pageSize;
      const data = all.slice(start, start + pageSize);
      return mockResponse(200, {
        data,
        total: all.length,
        page,
        pageSize,
      });
    }
    return mockResponse(200, all);
  }

  if (method === "GET" && itemId !== undefined) {
    const row = store.records.find((r) => String(r[store.idField]) === itemId);
    if (!row) return mockResponse(404, { message: "Not found" });
    return mockResponse(200, row);
  }

  if (method === "POST" && itemId === undefined) {
    const body = parseBody(input);
    const created: Record<string, unknown> = {
      ...body,
      [store.idField]: body[store.idField] ?? String(store.nextId++),
    };
    store.records.push(created);
    return mockResponse(201, created);
  }

  if ((method === "PUT" || method === "PATCH") && itemId !== undefined) {
    const index = store.records.findIndex((r) => String(r[store.idField]) === itemId);
    if (index < 0) return mockResponse(404, { message: "Not found" });
    const body = parseBody(input);
    const updated = {
      ...store.records[index]!,
      ...body,
      [store.idField]: store.records[index]![store.idField],
    };
    store.records[index] = updated;
    return mockResponse(200, updated);
  }

  if (method === "DELETE" && itemId !== undefined) {
    const index = store.records.findIndex((r) => String(r[store.idField]) === itemId);
    if (index < 0) return mockResponse(404, { message: "Not found" });
    store.records.splice(index, 1);
    return mockResponse(204, null);
  }

  return mockResponse(405, { message: `Unsupported ${method} ${url.pathname}` });
}
