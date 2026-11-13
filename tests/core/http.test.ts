import {
  ConfigError,
  defineApi,
  HttpError,
  NetworkError,
  SerializationError,
  isApiError,
} from "@apixa/core";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string; email: string };

type HttpApi = {
  users: {
    path: "/users";
    entity: User;
    operations: {
      getAll: { query: { limit?: number; active?: boolean }; response: User[] };
      getPost: {
        method: "GET";
        path: "/:userId/posts/:postId";
        response: { id: string };
      };
    };
  };
};

describe("request execution", () => {
  it("applies path parameters and query strings to the final URL", async () => {
    const seen: string[] = [];

    const api = defineApi<HttpApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        seen.push(request.url);
        if (request.url.startsWith("https://api.example.com/users?")) {
          return { body: [{ id: "123", name: "Ada", email: "ada@example.com" }] };
        }
        return { body: { id: "123", name: "Ada", email: "ada@example.com" } };
      }),
      resources: {
        users: {
          path: "/users",
          operations: {
            getAll: { method: "GET" },
            getById: { method: "GET", path: "/:id" },
            getPost: { kind: "read", method: "GET", path: "/:userId/posts/:postId" },
          },
        },
      },
    });

    await api.users.getById("123");
    await api.users.getAll({ query: { limit: 5, active: true } });
    await api.users.getPost({ params: { userId: "u1", postId: "p9" } });

    expect(seen).toEqual([
      "https://api.example.com/users/123",
      "https://api.example.com/users?limit=5&active=true",
      "https://api.example.com/users/u1/posts/p9",
    ]);
  });

  it("sends JSON bodies and shared headers", async () => {
    const api = defineApi<HttpApi>()({
      baseURL: "https://api.example.com",
      headers: { Accept: "application/json", "X-Client": "apixa" },
      transport: createFakeTransport((request) => {
        expect(request.headers.get("accept")).toBe("application/json");
        expect(request.headers.get("x-client")).toBe("apixa");
        expect(request.headers.get("content-type")).toBe("application/json");
        expect(request.body).toBe(JSON.stringify({ name: "Ada", email: "ada@example.com" }));
        return {
          status: 201,
          body: { id: "3", name: "Ada", email: "ada@example.com" } satisfies User,
        };
      }),
      resources: {
        users: {
          path: "/users",
          operations: {
            create: { method: "POST" },
            getPost: { kind: "read", method: "GET", path: "/:userId/posts/:postId" },
          },
        },
      },
    });

    const created = await api.users.create({ name: "Ada", email: "ada@example.com" });
    expect(created).toEqual({ id: "3", name: "Ada", email: "ada@example.com" });
  });

  it("returns unwrapped JSON data on success", async () => {
    const api = defineApi<HttpApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({
        body: { id: "1", name: "Ada", email: "ada@example.com" } satisfies User,
      })),
      resources: {
        users: {
          path: "/users",
          operations: {
            getById: { method: "GET", path: "/:id" },
            getPost: { kind: "read", method: "GET", path: "/:userId/posts/:postId" },
          },
        },
      },
    });

    const result = api.users.getById("1");
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toEqual({ id: "1", name: "Ada", email: "ada@example.com" });
  });

  it("throws HttpError for non-OK responses", async () => {
    const api = defineApi<HttpApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({
        status: 404,
        body: { detail: "User not found" },
      })),
      resources: {
        users: {
          path: "/users",
          operations: {
            getById: { method: "GET", path: "/:id" },
            getPost: { kind: "read", method: "GET", path: "/:userId/posts/:postId" },
          },
        },
      },
    });

    await expect(api.users.getById("missing")).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(HttpError);
      expect(isApiError(error)).toBe(true);
      if (error instanceof HttpError) {
        expect(error.status).toBe(404);
        expect(error.data).toEqual({ detail: "User not found" });
        expect(error.name).toBe("HttpError");
      }
      return true;
    });
  });

  it("surfaces NetworkError from the transport", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: {
        async request() {
          throw new NetworkError("failed to fetch");
        },
      },
      resources: {
        users: {
          path: "/users",
          operations: {
            getAll: { method: "GET" },
          },
        },
      },
    });

    await expect(api.users.getAll()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(NetworkError);
      expect(isApiError(error)).toBe(true);
      if (error instanceof NetworkError) {
        expect(error.message).toBe("failed to fetch");
        expect(error.code).toBe("NETWORK");
      }
      return true;
    });
  });
});

describe("v3 query and body serialization", () => {
  it("serializes nested objects, arrays, ISO dates, booleans, and percent-encoded keys", async () => {
    const seen: string[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      queryArrayFormat: "brackets",
      transport: createFakeTransport((request) => {
        seen.push(request.url);
        return { body: [] };
      }),
      resources: {
        products: { path: "/products" },
      },
    });

    const since = new Date("2025-01-02T03:04:05.000Z");
    await api.products.getAll({
      query: {
        filter: { color: "blue", meta: { tag: "new" } },
        tags: ["sale", "featured"],
        since,
        inStock: true,
        skipped: undefined,
        cleared: null,
        empty: [],
      },
    });

    expect(seen[0]).toBe(
      "https://api.example.com/products?" +
        [
          "filter%5Bcolor%5D=blue",
          "filter%5Bmeta%5D%5Btag%5D=new",
          "tags%5B%5D=sale",
          "tags%5B%5D=featured",
          "since=2025-01-02T03%3A04%3A05.000Z",
          "inStock=true",
        ].join("&"),
    );
    expect(Object.fromEntries(new URL(seen[0]!).searchParams)).toEqual({
      "filter[color]": "blue",
      "filter[meta][tag]": "new",
      "tags[]": "featured",
      since: "2025-01-02T03:04:05.000Z",
      inStock: "true",
    });
    expect(new URL(seen[0]!).searchParams.getAll("tags[]")).toEqual(["sale", "featured"]);
  });

  it("supports configurable null, empty array, and boolean query encoding", async () => {
    const seen: string[] = [];
    const make = (
      query: Record<string, unknown>,
      queryArrayFormat: "repeat" | "brackets" | "comma" = "repeat",
    ) =>
      defineApi({
        baseURL: "https://api.example.com",
        queryArrayFormat,
        query: query as never,
        transport: createFakeTransport((request) => {
          seen.push(request.url);
          return { body: [] };
        }),
        resources: { items: { path: "/items" } },
      });

    const emptyMode = make(
      { nulls: "empty", emptyArrays: "empty", booleans: "number" },
      "brackets",
    );
    await emptyMode.items.getAll({ query: { q: null, tags: [], active: true, archived: false } });
    expect(seen[0]).toBe("https://api.example.com/items?q=&tags%5B%5D=&active=1&archived=0");

    const nullMode = make({ nulls: "null", emptyArrays: "empty" }, "comma");
    await nullMode.items.getAll({ query: { q: null, tags: ["a", null], empty: [] } });
    expect(seen[1]).toBe("https://api.example.com/items?q=null&tags=a%2Cnull&empty=");
  });

  it("validates client-wide query options at construction", () => {
    expect(() =>
      defineApi({
        baseURL: "https://api.example.com",
        query: { nulls: "bad" } as never,
        resources: {},
      }),
    ).toThrow(ConfigError);
    expect(() =>
      defineApi({
        baseURL: "https://api.example.com",
        query: { unknown: "x" } as never,
        resources: {},
      }),
    ).toThrow(ConfigError);
  });

  it("wraps custom querySerializer failures and invalid return values in SerializationError", async () => {
    const throwing = defineApi({
      baseURL: "https://api.example.com",
      querySerializer: () => {
        throw new Error("cannot encode query");
      },
      transport: createFakeTransport(() => ({ body: [] })),
      resources: { items: { path: "/items" } },
    });
    await expect(throwing.items.getAll({ query: { a: 1 } })).rejects.toBeInstanceOf(
      SerializationError,
    );

    const badReturn = defineApi({
      baseURL: "https://api.example.com",
      querySerializer: (() => 123) as never,
      transport: createFakeTransport(() => ({ body: [] })),
      resources: { items: { path: "/items" } },
    });
    await expect(badReturn.items.getAll({ query: { a: 1 } })).rejects.toBeInstanceOf(
      SerializationError,
    );
  });

  it("throws typed SerializationError for invalid or cyclic query values", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: [] })),
      resources: { items: { path: "/items" } },
    });

    const cyclic: Record<string, unknown> = { ok: 1 };
    cyclic.self = cyclic;

    await expect(api.items.getAll({ query: cyclic as never })).rejects.toMatchObject({
      name: "SerializationError",
      code: "SERIALIZATION",
      path: "$.self",
    });
    await expect(api.items.getAll({ query: { at: new Date("bad") } })).rejects.toMatchObject({
      name: "SerializationError",
      path: "$.at",
    });
    await expect(
      api.items.getAll({ query: { nested: { fn: () => 1 } } as never }),
    ).rejects.toMatchObject({
      name: "SerializationError",
      path: "$.nested.fn",
    });
  });

  it("sends raw strings as text/plain and encodes string bodies as JSON when dataFormat is json", async () => {
    const seen: Array<{ body: unknown; contentType: string | null }> = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        seen.push({ body: request.body, contentType: request.headers.get("content-type") });
        return { body: { ok: true } };
      }),
      resources: {
        notes: {
          path: "/notes",
          operations: {
            sendRaw: { method: "POST", path: "/raw" },
            sendCustomCt: {
              method: "POST",
              path: "/csv",
              headers: { "Content-Type": "text/csv" },
            },
            sendJsonString: { method: "POST", path: "/json", dataFormat: "json" },
          },
        },
      },
    });

    await api.notes.sendRaw("hello");
    await api.notes.sendCustomCt("a,b");
    await api.notes.sendJsonString("hello");

    expect(seen).toEqual([
      { body: "hello", contentType: "text/plain" },
      { body: "a,b", contentType: "text/csv" },
      { body: '"hello"', contentType: "application/json" },
    ]);
  });

  it("throws typed SerializationError for invalid JSON body values without reaching transport", async () => {
    let calls = 0;
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => {
        calls++;
        return { body: {} };
      }),
      resources: { items: { path: "/items" } },
    });

    const cyclic: Record<string, unknown> = { secret: "TOP-SECRET" };
    cyclic.self = cyclic;

    await expect(api.items.create(cyclic as never)).rejects.toMatchObject({
      name: "SerializationError",
      code: "SERIALIZATION",
      path: "$.self",
    });
    await expect(api.items.create({ count: 10n } as never)).rejects.toMatchObject({
      name: "SerializationError",
      path: "$.count",
    });
    await expect(api.items.create({ d: new Date("nope") } as never)).rejects.toMatchObject({
      name: "SerializationError",
      path: "$.d",
    });
    await expect(api.items.create({ fn: () => 1 } as never)).rejects.toMatchObject({
      name: "SerializationError",
      path: "$.fn",
    });
    await expect(api.items.create({ m: new Map() } as never)).rejects.toMatchObject({
      name: "SerializationError",
      path: "$.m",
    });
    await expect(api.items.create({ n: Number.NaN } as never)).rejects.toMatchObject({
      name: "SerializationError",
      path: "$.n",
    });
    expect(calls).toBe(0);
  });
});
