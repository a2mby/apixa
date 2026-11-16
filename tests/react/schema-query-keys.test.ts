import { defineApi, prepareOperationQuery, SchemaValidationError } from "@apixa/core";
import type { TransportRequest } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createResourceQueryOptions } from "../../packages/react/src/query-options.js";
import { createFakeTransport } from "../helpers/fake-transport.js";

const Filters = z.object({ limit: z.coerce.number().default(10), tag: z.string().optional() });

function setup() {
  const requests: TransportRequest[] = [];
  const api = defineApi({
    baseURL: "https://api.example.com",
    transport: createFakeTransport((request) => {
      requests.push(request);
      return { body: [] };
    }),
    resources: {
      products: {
        path: "/products",
        operations: { preset: "read", getAll: { schema: { query: Filters } } },
      },
    },
  });
  return { api, requests };
}

describe("schema.query and TanStack Query keys", () => {
  it("prepareOperationQuery is synchronous and returns the parsed query", () => {
    const { api } = setup();
    const prepared = prepareOperationQuery(api.products, "getAll", { limit: "5" });
    expect(prepared).toEqual({ limit: 5 });
    expect(prepared).not.toBeInstanceOf(Promise);
    expect(() => prepareOperationQuery(api.products, "getAll", { limit: "x" })).toThrowError(
      SchemaValidationError,
    );
    // Operations without a query schema pass through untouched.
    const query = { a: 1 };
    expect(prepareOperationQuery(api.products, "getById", query)).toBe(query);
  });

  it("hashes the parsed query, and the call sends exactly that query", async () => {
    const { api, requests } = setup();
    const raw = createResourceQueryOptions(api.products, {
      queryKey: ["products"],
      query: { limit: "5" } as never,
    });
    const typed = createResourceQueryOptions(api.products, {
      queryKey: ["products"],
      query: { limit: 5 },
    });
    expect(raw.queryKey).toEqual(["products", "list", { limit: 5 }]);
    // Two spellings of the same logical request share one cache entry.
    expect(raw.queryKey).toEqual(typed.queryKey);
    await (raw.queryFn as (c: { signal: AbortSignal }) => Promise<unknown>)({
      signal: new AbortController().signal,
    });
    expect(new URL(requests[0]!.url).searchParams.get("limit")).toBe("5");
  });

  it("keeps the raw key for an invalid query; the call rejects with the schema error", async () => {
    const { api, requests } = setup();
    const options = createResourceQueryOptions(api.products, {
      queryKey: ["products"],
      query: { limit: "x" } as never,
    });
    expect(options.queryKey).toEqual(["products", "list", { limit: "x" }]);
    await expect(
      (options.queryFn as (c: { signal: AbortSignal }) => Promise<unknown>)({
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(SchemaValidationError);
    expect(requests).toHaveLength(0);
  });
});
