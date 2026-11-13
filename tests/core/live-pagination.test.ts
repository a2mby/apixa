import { ConfigError, defineApi, ParseError } from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { PAGINATION_PRESET_NAMES } from "../../packages/core/src/api/pagination.js";
import type {
  LaravelCursorPagination,
  LaravelPaginatorPagination,
  LaravelPagination,
  NestjsPagination,
  PayloadPagination,
  ResourcePagination,
  StrapiPagination,
} from "../../packages/core/src/types/definition.js";
import { createFakeTransport } from "../helpers/fake-transport.js";

type Product = { id: string; name: string };
type State = { products: { entity: Product } };

const laravelBody = {
  data: [{ id: "1", name: "Pen" }],
  links: { next: null },
  meta: { current_page: 2, per_page: 10, total: 31, last_page: 4 },
};

function client(pagination: unknown, body: unknown, seen: string[] = []) {
  return defineApi<State>()({
    baseURL: "https://api.example.com",
    transport: createFakeTransport((request) => {
      seen.push(request.url);
      return { body };
    }),
    resources: { products: { path: "/products", pagination: pagination as never } },
  });
}

describe("live pagination", () => {
  it("maps a Laravel body to the page contract with the preset", async () => {
    const seen: string[] = [];
    const api = client({ type: "page", preset: "laravel" }, laravelBody, seen);
    const page = await api.products.getAll({ query: { page: 2, pageSize: 10 } });
    expect(page).toEqual({ data: [{ id: "1", name: "Pen" }], total: 31, page: 2, pageSize: 10 });
    expect(seen[0]).toContain("per_page=10");
    expect(seen[0]).toContain("page=2");
    expect(seen[0]).not.toContain("pageSize");
  });

  it("maps with declared field paths and params", async () => {
    const seen: string[] = [];
    const api = client(
      {
        type: "page",
        fields: { data: "items", total: "paging.count", page: "paging.p", pageSize: "paging.size" },
        params: { pageSize: "limit" },
      },
      { items: [{ id: "1", name: "Pen" }], paging: { count: 5, p: 1, size: 20 } },
      seen,
    );
    const page = await api.products.getAll({ query: { pageSize: 20 } });
    expect(page).toEqual({ data: [{ id: "1", name: "Pen" }], total: 5, page: 1, pageSize: 20 });
    expect(seen[0]).toContain("limit=20");
  });

  it("maps with parseList", async () => {
    const api = client(
      {
        type: "page",
        parseList: (body: { rows: Product[] }) => ({
          data: body.rows,
          total: body.rows.length,
          page: 1,
          pageSize: 50,
        }),
      },
      { rows: [{ id: "1", name: "Pen" }] },
    );
    expect(await api.products.getAll()).toMatchObject({ total: 1, pageSize: 50 });
  });

  it("maps a cursor body", async () => {
    const api = client(
      { type: "cursor", fields: { data: "items", nextCursor: "next" } },
      { items: [{ id: "1", name: "Pen" }], next: "abc" },
    );
    expect(await api.products.getAll()).toEqual({
      data: [{ id: "1", name: "Pen" }],
      nextCursor: "abc",
    });
  });

  it("passes the body through unchanged for the string form (declared, not validated)", async () => {
    const own = { data: [{ id: "1", name: "Pen" }], total: 1, page: 1, pageSize: 10 };
    expect(await client("page", own).products.getAll()).toEqual(own);
  });

  it("throws ParseError naming the resource and path when a mapped field is missing", async () => {
    const api = client({ type: "page", preset: "laravel" }, { data: [], meta: {} });
    await expect(api.products.getAll()).rejects.toThrow(/products.*meta\.total/s);
    await expect(api.products.getAll()).rejects.toBeInstanceOf(ParseError);
  });

  it("rejects bad configuration", () => {
    expect(() => client({ type: "page", preset: "laravel", fields: {} }, {})).toThrow(ConfigError);
    expect(() => client({ type: "page", preset: "nope" }, {})).toThrow(ConfigError);
    expect(() => client({ type: "cursor", preset: "laravel" }, {})).toThrow(ConfigError);
    expect(() => client({ type: "table" }, {})).toThrow(ConfigError);
  });

  it("types getAll as a page for every form", () => {
    const api = defineApi<State>()({
      baseURL: "https://api.example.com",
      resources: {
        products: { path: "/products", pagination: { type: "page", preset: "laravel" } },
      },
    });
    expectTypeOf(api.products.getAll).returns.resolves.toEqualTypeOf<{
      data: Product[];
      total: number;
      page: number;
      pageSize: number;
    }>();
  });
});

describe("live pagination presets", () => {
  const rows = [{ id: "1", name: "Pen" }];
  const expectedPage = { data: rows, total: 31, page: 2, pageSize: 10 };

  // Bodies in each backend's documented shape. The Laravel paginator bodies are trimmed real output
  // of examples/backends/laravel-backend (`paginate(2)` and `cursorPaginate(2)`).
  const cases: [string, string, unknown, Record<string, string>][] = [
    [
      "laravel-paginator",
      "page",
      {
        current_page: 2,
        data: rows,
        first_page_url: "http://127.0.0.1:8000?page=1",
        per_page: 10,
        total: 31,
        last_page: 4,
        links: [],
      },
      { per_page: "10", page: "2" },
    ],
    [
      "strapi",
      "page",
      { data: rows, meta: { pagination: { page: 2, pageSize: 10, pageCount: 4, total: 31 } } },
      { "pagination[pageSize]": "10", "pagination[page]": "2" },
    ],
    [
      "payload",
      "page",
      { docs: rows, totalDocs: 31, limit: 10, page: 2, totalPages: 4, hasNextPage: true },
      { limit: "10", page: "2" },
    ],
    [
      "nestjs",
      "page",
      {
        items: rows,
        meta: { totalItems: 31, itemCount: 1, itemsPerPage: 10, totalPages: 4, currentPage: 2 },
      },
      { limit: "10", page: "2" },
    ],
  ];

  it.each(cases)(
    "%s maps its documented body and renames query keys",
    async (preset, type, body, query) => {
      const seen: string[] = [];
      const api = client({ type, preset }, body, seen);
      const page = await api.products.getAll({ query: { page: 2, pageSize: 10 } });
      expect(page).toEqual(expectedPage);
      const params = Object.fromEntries(new URL(seen[0]!).searchParams);
      expect(params).toEqual(query);
    },
  );

  it("maps a Laravel cursorPaginate() body with laravel-paginator", async () => {
    const seen: string[] = [];
    const api = client(
      { type: "cursor", preset: "laravel-paginator" },
      {
        data: rows,
        path: "http://127.0.0.1:8000",
        per_page: 2,
        next_cursor: "eyJpZCI6IjIifQ",
        next_page_url: "x",
        prev_cursor: null,
      },
      seen,
    );
    const page = await api.products.getAll({ query: { pageSize: 2, cursor: "abc" } });
    expect(page).toEqual({ data: rows, nextCursor: "eyJpZCI6IjIifQ" });
    expect(Object.fromEntries(new URL(seen[0]!).searchParams)).toEqual({
      per_page: "2",
      cursor: "abc",
    });
  });

  it("reports a missing field of a preset by its path", async () => {
    const api = client({ type: "page", preset: "strapi" }, { data: [], meta: {} });
    await expect(api.products.getAll()).rejects.toThrow(/meta\.pagination\.total/);
  });

  it("rejects a preset without the requested mode", () => {
    for (const preset of ["laravel", "strapi", "payload", "nestjs"]) {
      expect(() => client({ type: "cursor", preset }, {})).toThrow(ConfigError);
    }
  });

  it("keeps the runtime preset list and the public type in sync", () => {
    type Preset = Exclude<Extract<ResourcePagination, object>["preset"], undefined>;
    expectTypeOf<(typeof PAGINATION_PRESET_NAMES)[number]>().toEqualTypeOf<Preset>();
    expect([...PAGINATION_PRESET_NAMES].sort()).toEqual([
      "laravel",
      "laravel-paginator",
      "nestjs",
      "payload",
      "strapi",
    ]);
  });
});

describe("preset page types", () => {
  it("name the page contract each preset resolves to", async () => {
    const api = defineApi<State>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: laravelBody })),
      resources: {
        products: { path: "/products", pagination: { type: "page", preset: "laravel" } },
      },
    });
    const page = await api.products.getAll({ query: { page: 2 } });
    const typed: LaravelPagination<Product> = page;
    expectTypeOf(typed).toEqualTypeOf<{
      data: Product[];
      total: number;
      page: number;
      pageSize: number;
    }>();
    expectTypeOf<LaravelPaginatorPagination<Product>>().toEqualTypeOf<LaravelPagination<Product>>();
    expectTypeOf<LaravelCursorPagination<Product>>().toEqualTypeOf<{
      data: Product[];
      nextCursor: string | null;
    }>();
    expectTypeOf<StrapiPagination<Product>>().toEqualTypeOf<PayloadPagination<Product>>();
    expectTypeOf<NestjsPagination<Product>>().toEqualTypeOf<PayloadPagination<Product>>();
  });
});

describe("v3 unified pagination (Decisions 28-31)", () => {
  it("supports boolean true/false and preset shorthands without wrapping objects", async () => {
    const seen: string[] = [];
    const api = defineApi<{
      paged: { entity: Product };
      flat: { entity: Product };
      shorthand: { entity: Product };
      noTypeObj: { entity: Product };
    }>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((req) => {
        seen.push(req.url);
        if (req.url.includes("/paged")) {
          return { body: { data: [{ id: "1", name: "Pen" }], total: 1, page: 1, pageSize: 10 } };
        }
        if (req.url.includes("/flat")) {
          return { body: [{ id: "1", name: "Pen" }] };
        }
        return { body: laravelBody };
      }),
      resources: {
        paged: { path: "/paged", pagination: true },
        flat: { path: "/flat", pagination: false },
        shorthand: { path: "/shorthand", pagination: "laravel" },
        noTypeObj: { path: "/no-type", pagination: { preset: "laravel" } },
      },
    });

    const p1 = await api.paged.getAll({ query: { page: 1, pageSize: 10 } });
    expect(p1).toEqual({ data: [{ id: "1", name: "Pen" }], total: 1, page: 1, pageSize: 10 });
    expectTypeOf(p1).toEqualTypeOf<{ data: Product[]; total: number; page: number; pageSize: number }>();

    const p2 = await api.flat.getAll();
    expect(p2).toEqual([{ id: "1", name: "Pen" }]);
    expectTypeOf(p2).toEqualTypeOf<Product[]>();

    const p3 = await api.shorthand.getAll({ query: { page: 2, pageSize: 10 } });
    expect(p3).toEqual({ data: [{ id: "1", name: "Pen" }], total: 31, page: 2, pageSize: 10 });
    expectTypeOf(p3).toEqualTypeOf<{ data: Product[]; total: number; page: number; pageSize: number }>();
    expect(seen.find((u) => u.includes("/shorthand"))).toContain("per_page=10");

    const p4 = await api.noTypeObj.getAll({ query: { page: 2 } });
    expect(p4).toEqual({ data: [{ id: "1", name: "Pen" }], total: 31, page: 2, pageSize: 10 });
    expectTypeOf(p4).toEqualTypeOf<{ data: Product[]; total: number; page: number; pageSize: number }>();
  });

  it("allows getAll to opt out of or override resource-level pagination", async () => {
    const api = defineApi<{
      optout: { entity: Product };
      overrideCursor: { entity: Product };
    }>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((req) => {
        if (req.url.includes("/optout")) return { body: [{ id: "1", name: "Pen" }] };
        return { body: { data: [{ id: "1", name: "Pen" }], nextCursor: "n2" } };
      }),
      resources: {
        optout: {
          path: "/optout",
          pagination: "laravel",
          operations: { getAll: { pagination: false } },
        },
        overrideCursor: {
          path: "/override",
          pagination: "page",
          operations: { getAll: { pagination: "cursor" } },
        },
      },
    });

    const list = await api.optout.getAll();
    expect(list).toEqual([{ id: "1", name: "Pen" }]);
    expectTypeOf(list).toEqualTypeOf<Product[]>();

    const cur = await api.overrideCursor.getAll({ query: { cursor: "c1", pageSize: 5 } });
    expect(cur).toEqual({ data: [{ id: "1", name: "Pen" }], nextCursor: "n2" });
    expectTypeOf(cur).toEqualTypeOf<{ data: Product[]; nextCursor: string | null }>();
  });

  it("supports opt-in pagination on getMany and custom declarative operations (live & mock)", async () => {
    const seen: string[] = [];
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1), name: `P${i + 1}` }));
    const live = defineApi<{
      products: {
        entity: Product;
        operations: {
          search: { query: { q: string }; response: Product[] };
        };
      };
    }>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((req) => {
        seen.push(req.url);
        if (req.url.includes("/search")) {
          return { body: { data: [{ id: "2", name: "Pen" }], nextCursor: null } };
        }
        return { body: laravelBody };
      }),
      resources: {
        products: {
          path: "/products",
          pagination: "laravel",
          operations: {
            getMany: { pagination: true },
            search: { method: "GET", path: "/search", pagination: "cursor" },
          },
        },
      },
    });

    const many = await live.products.getMany(["1", "2"], { query: { page: 2, pageSize: 10 } });
    expect(many).toEqual({ data: [{ id: "1", name: "Pen" }], total: 31, page: 2, pageSize: 10 });
    expectTypeOf(many).toEqualTypeOf<{ data: Product[]; total: number; page: number; pageSize: number }>();
    expect(seen[0]).toContain("per_page=10");

    const found = await live.products.search({ query: { q: "pen", cursor: "0", pageSize: 5 } });
    expect(found).toEqual({ data: [{ id: "2", name: "Pen" }], nextCursor: null });
    expectTypeOf(found).toEqualTypeOf<{ data: Product[]; nextCursor: string | null }>();

    const mocked = defineApi({
      baseURL: "/api",
      resources: {
        products: {
          path: "/products",
          mock: rows,
          pagination: "page",
          operations: {
            getMany: { pagination: true },
            recent: {
              method: "GET",
              path: "/recent",
              pagination: "cursor",
              mock: ({ records }) => records.slice(0, 5),
            },
          },
        },
      },
    });

    const mockMany = await mocked.products.getMany(["1", "2", "3", "4", "5"], {
      query: { page: 2, pageSize: 2 },
    });
    expect(mockMany).toEqual({
      data: [
        { id: "3", name: "P3" },
        { id: "4", name: "P4" },
      ],
      total: 5,
      page: 2,
      pageSize: 2,
    });
    expectTypeOf(mockMany).toEqualTypeOf<{
      data: { id: string; name: string }[];
      total: number;
      page: number;
      pageSize: number;
    }>();

    const mockRecent = await mocked.products.recent({ query: { cursor: "2", pageSize: 2 } });
    expect(mockRecent).toEqual({
      data: [
        { id: "3", name: "P3" },
        { id: "4", name: "P4" },
      ],
      nextCursor: "4",
    });
    expectTypeOf(mockRecent).toEqualTypeOf<{ data: unknown[]; nextCursor: string | null }>();
  });

  it("allows slice with pagination: false and rejects pagination on non-list builtins at compile time", async () => {
    const api = defineApi<State>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({
        body: [
          { id: "1", name: "A" },
          { id: "2", name: "B" },
          { id: "3", name: "C" },
        ],
      })),
      resources: {
        products: { path: "/products", slice: 2, pagination: false },
      },
    });
    expect(await api.products.getAll()).toEqual([
      { id: "1", name: "A" },
      { id: "2", name: "B" },
    ]);

    if (false as boolean) {
      defineApi({
        baseURL: "https://api.example.com",
        resources: {
          products: {
            path: "/products",
            operations: {
              // @ts-expect-error pagination is unsupported on non-list builtins
              getById: { pagination: "page" },
            },
          },
        },
      });
    }
  });

  it("preserves pagination envelope keys during response key transforms on live and mocked calls", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transforms: { response: { keys: "snake_case" } },
      transport: createFakeTransport(() => ({
        body: { data: [{ id: "1", firstName: "Ada" }], total: 1, page: 1, pageSize: 10 },
      })),
      resources: {
        users: { path: "/users", pagination: "page" },
      },
    });
    expect(await api.users.getAll()).toEqual({
      data: [{ id: "1", first_name: "Ada" }],
      total: 1,
      page: 1,
      pageSize: 10,
    });
  });
});
