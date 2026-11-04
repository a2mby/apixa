import type { TransportRequest, TransportResponse } from "@apixa/core";
import { mockResponse } from "./response.js";
import { applySlice, type MockSlice } from "./slice.js";
import type { Dataset } from "./types.js";

export type ExtendedRouteName = "getBySlug" | "count" | "search" | "createMany" | "deleteMany";

export type ExtendedRouteOverride = { method?: string; path?: string } | false;
export type ExtendedRouteOverrides = Partial<Record<ExtendedRouteName, ExtendedRouteOverride>>;

export type ExtendedRoute = {
  name: ExtendedRouteName;
  method: string;
  /** Relative to the store's path, no leading slash, e.g. "slug/:slug" or "count". */
  path: string;
};

/**
 * Local mirror of Core's `EXTENDED_CONVENTION_DEFAULTS` for just the 5 builtins that need a new
 * static route (`patch` / `upsert` already reuse the generic `/:id` handling below for free;
 * `getMany` / `exists` / `findFirst` / `getBy` execute their own Core requests and reach the
 * generic handlers below without extra static routes.
 */
const EXTENDED_ROUTE_DEFAULTS: Record<ExtendedRouteName, { method: string; path: string }> = {
  getBySlug: { method: "GET", path: "slug/:slug" },
  count: { method: "GET", path: "count" },
  search: { method: "GET", path: "search" },
  createMany: { method: "POST", path: "bulk" },
  deleteMany: { method: "DELETE", path: "bulk" },
};

/** Resolve which extended static routes this store should simulate, honoring `operations` overrides. */
export function resolveExtendedRoutes(overrides?: ExtendedRouteOverrides): ExtendedRoute[] {
  const routes: ExtendedRoute[] = [];
  for (const name of Object.keys(EXTENDED_ROUTE_DEFAULTS) as ExtendedRouteName[]) {
    const override = overrides?.[name];
    if (override === false) continue;
    const defaults = EXTENDED_ROUTE_DEFAULTS[name];
    const method = override?.method ?? defaults.method;
    const path = (override?.path ?? defaults.path).replace(/^\/+/, "");
    routes.push({ name, method, path });
  }
  return routes;
}

export type MockStore = {
  path: string;
  idField: string;
  records: Record<string, unknown>[];
  nextId: number;
  pagination?: boolean;
  extendedRoutes: ExtendedRoute[];
};

export function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

export function cloneRecords(records: Record<string, unknown>[]): Record<string, unknown>[] {
  return records.map((row) => structuredClone(row));
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

export function parseBodyArray(input: TransportRequest): unknown[] {
  if (input.body == null || input.body === "") return [];
  if (typeof input.body === "string") {
    try {
      const parsed = JSON.parse(input.body) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
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
  options: {
    path?: string;
    slice?: MockSlice;
    pagination?: boolean;
    extendedRoutes?: ExtendedRouteOverrides;
  } = {},
): MockStore {
  const idField = dataset.meta.resource.idField ?? "id";
  const label = `Mock store "${normalizePath(options.path ?? dataset.meta.resource.path)}"`;
  // Seed limit (same as defineMockApi): apply once; creates may grow past the window.
  const records = applySlice(cloneRecords(dataset.records), options.slice, label);
  return {
    path: normalizePath(options.path ?? dataset.meta.resource.path),
    idField,
    records,
    nextId: maxNumericId(records, idField) + 1,
    pagination: options.pagination,
    extendedRoutes: resolveExtendedRoutes(options.extendedRoutes),
  };
}

/**
 * Find the store owning `pathname`, and the remainder of the path under it (if any). `rest` can
 * be multiple segments deep (e.g. `"slug/abc"`) — matching used to be restricted to a single
 * segment, which meant any multi-segment path under a mocked resource (an unrecognized custom
 * route, or `getBySlug`'s own default `/slug/:slug` shape) silently fell through to the real
 * fallback transport instead of being handled (and 404ing) by the mock store. Once a resource is
 * mocked, nothing under its path should reach a live network call.
 */
export function findStore(
  stores: MockStore[],
  pathname: string,
): { store: MockStore; rest?: string } | null {
  const path = normalizePath(pathname);

  for (const store of stores) {
    if (path === store.path) {
      return { store };
    }
    if (path.startsWith(`${store.path}/`)) {
      return { store, rest: path.slice(store.path.length + 1) };
    }
  }

  return null;
}

function matchRouteTemplate(template: string, rest: string): Record<string, string> | null {
  const templateSegments = template.split("/").filter(Boolean);
  const restSegments = rest.split("/").filter(Boolean);
  if (templateSegments.length !== restSegments.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < templateSegments.length; i++) {
    const templateSegment = templateSegments[i]!;
    const restSegment = restSegments[i]!;
    if (templateSegment.startsWith(":")) {
      params[templateSegment.slice(1)] = decodeURIComponent(restSegment);
    } else if (templateSegment !== restSegment) {
      return null;
    }
  }
  return params;
}

function parsePageParams(url: URL): { page: number; pageSize: number } {
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(url.searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.floor(pageSizeRaw) : 20;
  return { page, pageSize };
}

function handleExtendedRoute(
  store: MockStore,
  name: ExtendedRouteName,
  params: Record<string, string>,
  input: TransportRequest,
  url: URL,
): TransportResponse {
  switch (name) {
    case "getBySlug": {
      const slug = params.slug;
      const row = store.records.find((r) => String(r.slug) === slug);
      if (!row) return mockResponse(404, { message: `no record with slug "${slug}"` });
      return mockResponse(200, structuredClone(row));
    }

    case "count":
      return mockResponse(200, store.records.length);

    case "search": {
      const query: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        query[key] = value;
      });
      if (Object.keys(query).length === 0) {
        return mockResponse(200, cloneRecords(store.records));
      }
      const matches = store.records.filter((row) =>
        Object.entries(query).every(([key, value]) =>
          String(row[key] ?? "")
            .toLowerCase()
            .includes(value.toLowerCase()),
        ),
      );
      return mockResponse(200, cloneRecords(matches));
    }

    case "createMany": {
      const inputs = parseBodyArray(input);
      const created = inputs.map((item) => {
        const body =
          item && typeof item === "object" && !Array.isArray(item)
            ? (item as Record<string, unknown>)
            : {};
        const row: Record<string, unknown> = {
          ...body,
          [store.idField]: body[store.idField] ?? String(store.nextId++),
        };
        store.records.push(row);
        return row;
      });
      return mockResponse(201, cloneRecords(created));
    }

    case "deleteMany": {
      const ids = parseBodyArray(input).map((id) => String(id));
      for (const id of ids) {
        const index = store.records.findIndex((r) => String(r[store.idField]) === id);
        if (index >= 0) store.records.splice(index, 1);
      }
      return mockResponse(204, null);
    }
  }
}

/** Handle a CRUD request against an in-memory store. */
export function handleStoreRequest(
  store: MockStore,
  input: TransportRequest,
  url: URL,
): TransportResponse {
  const match = findStore([store], url.pathname);
  if (!match) {
    return mockResponse(404, { message: `No mock store for ${url.pathname}` });
  }

  const rest = match.rest;
  const method = input.method.toUpperCase();

  if (rest !== undefined) {
    for (const route of store.extendedRoutes) {
      if (route.method !== method) continue;
      const params = matchRouteTemplate(route.path, rest);
      if (params) {
        return handleExtendedRoute(store, route.name, params, input, url);
      }
    }
  }

  const itemId = rest !== undefined && !rest.includes("/") ? decodeURIComponent(rest) : undefined;

  if (method === "GET" && rest === undefined) {
    const requestedIds = [...url.searchParams.getAll("id"), ...url.searchParams.getAll("id[]")];
    const all = requestedIds.length
      ? store.records.filter((row) => requestedIds.includes(String(row[store.idField])))
      : store.records;
    if (store.pagination) {
      const { page, pageSize } = parsePageParams(url);
      const start = (page - 1) * pageSize;
      const data = all.slice(start, start + pageSize);
      return mockResponse(200, {
        data: cloneRecords(data),
        total: all.length,
        page,
        pageSize,
      });
    }
    return mockResponse(200, cloneRecords(all));
  }

  if (method === "GET" && itemId !== undefined) {
    const row = store.records.find((r) => String(r[store.idField]) === itemId);
    if (!row) return mockResponse(404, { message: "Not found" });
    return mockResponse(200, structuredClone(row));
  }

  if (method === "POST" && rest === undefined) {
    const body = parseBody(input);
    const created: Record<string, unknown> = {
      ...body,
      [store.idField]: body[store.idField] ?? String(store.nextId++),
    };
    store.records.push(created);
    return mockResponse(201, structuredClone(created));
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
    return mockResponse(200, structuredClone(updated));
  }

  if (method === "DELETE" && itemId !== undefined) {
    const index = store.records.findIndex((r) => String(r[store.idField]) === itemId);
    if (index < 0) return mockResponse(404, { message: "Not found" });
    store.records.splice(index, 1);
    return mockResponse(204, null);
  }

  return mockResponse(404, { message: `No mock route for ${method} ${url.pathname}` });
}
