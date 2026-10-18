import type { Transport, TransportRequest } from "@apixa/core";
import { mockResponse } from "./response.js";
import type { Dataset } from "./types.js";

export interface CreateMockTransportOptions {
  /** One or more local datasets; routed by `meta.resource.path`. */
  dataset?: Dataset;
  datasets?: Dataset[];
}

type Store = {
  path: string;
  idField: string;
  records: Record<string, unknown>[];
  nextId: number;
};

function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function cloneRecords(records: Record<string, unknown>[]): Record<string, unknown>[] {
  return records.map((row) => ({ ...row }));
}

function parseBody(input: TransportRequest): Record<string, unknown> {
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

function maxNumericId(records: Record<string, unknown>[], idField: string): number {
  let max = 0;
  for (const row of records) {
    const value = row[idField];
    const n = typeof value === "number" ? value : Number(String(value));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

function buildStores(datasets: Dataset[]): Store[] {
  return datasets.map((dataset) => {
    const idField = dataset.meta.resource.idField ?? "id";
    const records = cloneRecords(dataset.records);
    return {
      path: normalizePath(dataset.meta.resource.path),
      idField,
      records,
      nextId: maxNumericId(records, idField) + 1,
    };
  });
}

function findStore(stores: Store[], pathname: string): { store: Store; id?: string } | null {
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

/**
 * Mock `Transport` seeded from local dataset(s).
 * Supports builtin CRUD against `meta.resource.path` with an in-memory store.
 * Does not touch Core’s production Fetch path.
 */
export function createMockTransport(options: CreateMockTransportOptions): Transport {
  const datasets = options.datasets ?? (options.dataset ? [options.dataset] : []);
  if (datasets.length === 0) {
    throw new Error("createMockTransport requires dataset or datasets");
  }

  const stores = buildStores(datasets);

  return {
    async request(input: TransportRequest) {
      const url = new URL(input.url, "https://mock.local");
      const match = findStore(stores, url.pathname);
      if (!match) {
        return mockResponse(404, { message: `No mock dataset for ${url.pathname}` });
      }

      const { store, id } = match;
      const method = input.method.toUpperCase();

      if (method === "GET" && id === undefined) {
        return mockResponse(200, store.records);
      }

      if (method === "GET" && id !== undefined) {
        const row = store.records.find((r) => String(r[store.idField]) === id);
        if (!row) return mockResponse(404, { message: "Not found" });
        return mockResponse(200, row);
      }

      if (method === "POST" && id === undefined) {
        const body = parseBody(input);
        const created: Record<string, unknown> = {
          ...body,
          [store.idField]: body[store.idField] ?? String(store.nextId++),
        };
        store.records.push(created);
        return mockResponse(201, created);
      }

      if (method === "PUT" && id !== undefined) {
        const index = store.records.findIndex((r) => String(r[store.idField]) === id);
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

      if (method === "DELETE" && id !== undefined) {
        const index = store.records.findIndex((r) => String(r[store.idField]) === id);
        if (index < 0) return mockResponse(404, { message: "Not found" });
        store.records.splice(index, 1);
        return mockResponse(204, null);
      }

      return mockResponse(405, { message: `Unsupported ${method} ${url.pathname}` });
    },
  };
}
