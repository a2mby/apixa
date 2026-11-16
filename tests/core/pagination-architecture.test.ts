import {
  ConfigError,
  ParseError,
  ValidationError,
  defineApi,
  nextPageInput,
  paginationContextKey,
  previousPageInput,
  type TransportRequest,
} from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeTransport, type FakeResult } from "../helpers/fake-transport.js";

type Row = { id: string; name: string };
const rows = (n: number, from = 1): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: String(from + i), name: `P${from + i}` }));

function live(
  resource: Record<string, unknown>,
  respond: (request: TransportRequest) => FakeResult = () => ({ body: {} }),
  root: Record<string, unknown> = {},
) {
  const sent: TransportRequest[] = [];
  const api = defineApi({
    baseURL: "https://api.example.com",
    transport: createFakeTransport((request) => {
      sent.push(request);
      return respond(request);
    }),
    ...root,
    resources: { products: { path: "/products", ...resource } },
  } as never) as unknown as Record<
    string,
    Record<string, (...args: unknown[]) => Promise<unknown>>
  >;
  return { api: api.products!, sent };
}

const laravelBody = (page: number, perPage: number, total: number) => ({
  data: rows(2),
  links: {},
  meta: { current_page: page, per_page: perPage, total, last_page: Math.ceil(total / perPage) },
});

describe("activation and complete replacement", () => {
  const config = {
    paginationConfig: "laravel",
    operations: {
      search: { method: "GET", path: "/search", pagination: true },
      archived: { method: "GET", path: "/archived", pagination: "cursor" },
      stats: { method: "GET", path: "/stats", pagination: false },
      plain: { method: "GET", path: "/plain" },
    },
  };

  it("paginates getAll automatically from paginationConfig and maps the Laravel envelope", async () => {
    const { api, sent } = live(config, () => ({ body: laravelBody(2, 10, 31) }));
    const page = await api.getAll!({ query: { page: 2, pageSize: 10, category: "books" } });
    expect(page).toEqual({ data: rows(2), total: 31, page: 2, pageSize: 10 });
    const url = new URL(sent[0]!.url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      per_page: "10",
      category: "books",
    });
  });

  it("pagination: true reuses the shared configuration", async () => {
    const { api, sent } = live(config, () => ({ body: laravelBody(1, 5, 9) }));
    const page = (await api.search!({ query: { pageSize: 5 } })) as { total: number };
    expect(page.total).toBe(9);
    expect(sent[0]!.url).toContain("per_page=5");
  });

  it("an explicit strategy replaces the shared configuration instead of merging into it", async () => {
    const { api, sent } = live(config, () => ({
      body: { data: rows(1), nextCursor: null, meta: { current_page: 1 } },
    }));
    const out = await api.archived!({ query: { pageSize: 5, cursor: "abc" } });
    // Standard cursor envelope, not Laravel's; and pageSize is NOT renamed to per_page.
    expect(out).toMatchObject({ nextCursor: null });
    expect(sent[0]!.url).toContain("pageSize=5");
    expect(sent[0]!.url).not.toContain("per_page");
  });

  it("pagination: false and unconfigured operations are never normalized", async () => {
    const { api } = live(config, () => ({ body: [{ id: "1" }] }));
    expect(await api.stats!()).toEqual([{ id: "1" }]);
    expect(await api.plain!()).toEqual([{ id: "1" }]);
  });

  it("custom operations are never paginated by the resource configuration alone", async () => {
    const { api } = live(
      { paginationConfig: "laravel", operations: { plain: { method: "GET" } } },
      () => ({
        body: { anything: true },
      }),
    );
    expect(await api.plain!()).toEqual({ anything: true });
  });

  it("pagination: true without shared configuration uses the standard page contract", async () => {
    const { api } = live(
      { operations: { list: { method: "GET", path: "/list", pagination: true } } },
      () => ({ body: { data: rows(1), total: 1, page: 1, pageSize: 20 } }),
    );
    expect(await api.list!()).toEqual({ data: rows(1), total: 1, page: 1, pageSize: 20 });
  });
});

describe("resource-level alias", () => {
  it("rejects the legacy resource `pagination` property in v3", () => {
    expect(() => live({ pagination: "laravel" })).toThrow(ConfigError);
    expect(() => live({ pagination: "laravel" })).toThrow(
      /resources\.products\.pagination was renamed to `paginationConfig`/,
    );
  });

  it("rejects supplying both", () => {
    expect(() => live({ pagination: "page", paginationConfig: "page" })).toThrow(ConfigError);
    expect(() => live({ pagination: "page", paginationConfig: "page" })).toThrow(
      /resources\.products\.pagination was renamed to `paginationConfig`/,
    );
  });

  it("names paginationConfig in its own validation errors", () => {
    expect(() => live({ paginationConfig: "nope" })).toThrow(/paginationConfig must be true/);
  });

  it("rejects slice beside an active shared configuration, but not when getAll opts out", () => {
    expect(() => live({ paginationConfig: "page", slice: 2 })).toThrow(/slice cannot be combined/);
    expect(() =>
      live({ paginationConfig: "page", slice: 2, operations: { getAll: { pagination: false } } }),
    ).not.toThrow();
  });
});

describe("page strategy", () => {
  it("converts zero-based backend pages in both directions", async () => {
    const { api, sent } = live(
      {
        paginationConfig: {
          strategy: "page",
          pageBase: 0,
          fields: { data: "items", total: "count", page: "p", pageSize: "size" },
          params: { page: "p", pageSize: "size" },
        },
      },
      () => ({ body: { items: rows(1), count: 9, p: 0, size: 3 } }),
    );
    const page = (await api.getAll!({ query: { page: 1, pageSize: 3 } })) as { page: number };
    expect(page.page).toBe(1);
    expect(new URL(sent[0]!.url).searchParams.get("p")).toBe("0");
  });

  it("rejects invalid logical values before any request is made", async () => {
    const { api, sent } = live({ paginationConfig: "laravel" });
    for (const query of [{ page: 0 }, { page: 1.5 }, { pageSize: 0 }, { pageSize: "x" }]) {
      await expect(api.getAll!({ query })).rejects.toBeInstanceOf(ValidationError);
    }
    expect(sent).toHaveLength(0);
  });

  it("a valid empty page is a normal result", async () => {
    const { api } = live({ paginationConfig: "page" }, () => ({
      body: { data: [], total: 0, page: 1, pageSize: 20 },
    }));
    expect(await api.getAll!()).toMatchObject({ data: [], total: 0 });
  });

  it("does not turn a backend error for an out-of-range page into an empty success", async () => {
    const { api } = live({ paginationConfig: "page" }, () => ({
      status: 404,
      body: { error: "x" },
    }));
    await expect(api.getAll!({ query: { page: 99 } })).rejects.toMatchObject({ status: 404 });
  });

  it("makes total optional for custom field mappings and never fabricates it", async () => {
    const { api } = live(
      {
        paginationConfig: { strategy: "page", fields: { data: "items", page: "p", pageSize: "n" } },
      },
      () => ({ body: { items: rows(1), p: 1, n: 5 } }),
    );
    const out = (await api.getAll!()) as Record<string, unknown>;
    expect(out).toEqual({ data: rows(1), page: 1, pageSize: 5 });
    expect("total" in out).toBe(false);
  });

  it("still requires a total declared in the mapping", async () => {
    const { api } = live(
      {
        paginationConfig: {
          strategy: "page",
          fields: { data: "items", page: "p", pageSize: "n", total: "count" },
        },
      },
      () => ({ body: { items: [], p: 1, n: 5 } }),
    );
    await expect(api.getAll!()).rejects.toBeInstanceOf(ParseError);
  });
});

describe("offset strategy", () => {
  it("accepts the standard offset envelope and maps request names", async () => {
    const { api, sent } = live(
      { paginationConfig: { strategy: "offset", params: { offset: "skip", pageSize: "take" } } },
      () => ({ body: { data: rows(2), total: 10, offset: 4, pageSize: 2, nextOffset: 6 } }),
    );
    const out = await api.getAll!({ query: { offset: 4, pageSize: 2, q: "x" } });
    expect(out).toMatchObject({ offset: 4, nextOffset: 6 });
    expect(Object.fromEntries(new URL(sent[0]!.url).searchParams)).toEqual({
      skip: "4",
      take: "2",
      q: "x",
    });
  });

  it("rejects negative and fractional offsets", async () => {
    const { api } = live({ paginationConfig: "offset" });
    for (const offset of [-1, 1.2, "a"]) {
      await expect(api.getAll!({ query: { offset } })).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(api.getAll!({ query: { offset: 0 } })).rejects.toBeInstanceOf(ParseError);
  });

  it("validates malformed metadata", async () => {
    for (const body of [
      { data: [], total: 1, offset: -1, pageSize: 5 },
      { data: [], total: 1, offset: 0, pageSize: 0 },
      { data: [], total: 1, offset: 0, pageSize: 5, nextOffset: "7" },
      { data: [], total: 1, offset: 0, pageSize: 5, nextOffset: null, hasMore: true },
    ]) {
      const { api } = live({ paginationConfig: "offset" }, () => ({ body }));
      await expect(api.getAll!()).rejects.toBeInstanceOf(ParseError);
    }
  });

  it("continues after the rows the backend actually returned when it caps the size", () => {
    const result = { data: rows(50), offset: 0, pageSize: 50, total: 500 };
    const next = nextPageInput("offset", result, { query: { offset: 0, pageSize: 100 } });
    expect(next).toEqual({ query: { offset: 50, pageSize: 100 } });
  });
});

describe("cursor strategy", () => {
  it("passes cursors back exactly and never decodes them", async () => {
    const weird = "ey/J+=%20 \u00fcn\u00ef?&=#";
    const { api, sent } = live({ paginationConfig: "cursor" }, () => ({
      body: { data: rows(1), nextCursor: weird },
    }));
    const out = (await api.getAll!({ query: { cursor: weird } })) as { nextCursor: string };
    expect(out.nextCursor).toBe(weird);
    expect(new URL(sent[0]!.url).searchParams.get("cursor")).toBe(weird);
  });

  it("rejects non-string cursors without echoing them", async () => {
    const { api } = live({ paginationConfig: "cursor" });
    await expect(api.getAll!({ query: { cursor: { secret: "tok" } } })).rejects.toSatisfy(
      (e: Error) => e instanceof ValidationError && !e.message.includes("tok"),
    );
  });

  it("supports forward-only protocols: no previous cursor is invented", async () => {
    const { api } = live({ paginationConfig: "cursor" }, () => ({
      body: { data: rows(1), nextCursor: "n2" },
    }));
    const out = (await api.getAll!()) as Record<string, unknown>;
    expect("previousCursor" in out).toBe(false);
    expect(previousPageInput("cursor", out, { query: {} })).toBeNull();
  });

  it("exposes Laravel's prev_cursor through the laravel-paginator preset", async () => {
    const { api } = live(
      { paginationConfig: { strategy: "cursor", preset: "laravel-paginator" } },
      () => ({ body: { data: rows(1), next_cursor: "n", prev_cursor: "p" } }),
    );
    const out = await api.getAll!();
    expect(out).toEqual({ data: rows(1), nextCursor: "n", previousCursor: "p" });
    // Laravel sends prev_cursor back as the ordinary `cursor`.
    expect(
      previousPageInput("cursor", out, { query: { x: 1 } }, { previousKey: "cursor" }),
    ).toEqual({
      query: { x: 1, cursor: "p" },
    });
  });

  it("only sends `before` when a backend name is configured", async () => {
    const { api, sent } = live(
      { paginationConfig: { strategy: "cursor", params: { before: "prev" } } },
      () => ({
        body: { data: [], nextCursor: null },
      }),
    );
    await api.getAll!({ query: { before: "b1" } });
    expect(new URL(sent[0]!.url).searchParams.get("prev")).toBe("b1");
    const { api: bare } = live({ paginationConfig: "cursor" });
    await expect(bare.getAll!({ query: { before: "b1" } })).rejects.toThrow(/params.before/);
  });

  it("rejects contradictory metadata instead of picking a winner", async () => {
    for (const body of [
      { data: [], nextCursor: "x", hasMore: false },
      { data: [], nextCursor: null, hasMore: true },
    ]) {
      const { api } = live({ paginationConfig: "cursor" }, () => ({ body }));
      await expect(api.getAll!()).rejects.toThrow(/contradicts nextCursor/);
    }
  });
});

describe("request mapping, collisions and defaults", () => {
  it("rejects a logical name together with its configured backend name", async () => {
    const { api, sent } = live({ paginationConfig: "laravel" });
    await expect(api.getAll!({ query: { pageSize: 20, per_page: 50 } })).rejects.toThrow(
      /maps to backend name "per_page"/,
    );
    expect(sent).toHaveLength(0);
  });

  it("rejects two logical values configured onto one backend name", () => {
    expect(() =>
      live({ paginationConfig: { strategy: "page", params: { page: "n", pageSize: "n" } } }),
    ).toThrow(/same backend name "n"/);
  });

  it("detects collisions introduced by key transformation", async () => {
    const { api, sent } = live({ paginationConfig: "laravel" }, () => ({ body: {} }), {
      transforms: { request: { keys: "snake_case" } },
    });
    await expect(api.getAll!({ query: { perPage: 5, pageSize: 20 } })).rejects.toThrow(/collides/);
    expect(sent).toHaveLength(0);
  });

  it("detects a middleware-added logical name beside its backend name", async () => {
    const { api, sent } = live(
      {
        paginationConfig: "laravel",
        middleware: {
          onRequest: [
            (request: { query?: Record<string, unknown> }) => {
              request.query = { ...request.query, pageSize: 99 };
              return request;
            },
          ],
        },
      },
      () => ({ body: laravelBody(1, 5, 5) }),
    );
    await expect(api.getAll!({ query: { pageSize: 5 } })).rejects.toThrow(/both set/);
    expect(sent).toHaveLength(0);
  });

  it("applies configured defaults, rejects (never clamps) oversize requests", async () => {
    const { api, sent } = live(
      {
        paginationConfig: {
          strategy: "page",
          params: { pageSize: "limit" },
          defaultPageSize: 25,
          maxPageSize: 50,
        },
      },
      () => ({ body: { data: [], total: 0, page: 1, pageSize: 25 } }),
    );
    await api.getAll!();
    expect(new URL(sent[0]!.url).searchParams.get("limit")).toBe("25");
    await expect(api.getAll!({ query: { pageSize: 51 } })).rejects.toThrow(/maxPageSize/);
    expect(sent).toHaveLength(1);
  });

  it("does not mutate the caller's input and keeps unrelated parameters", async () => {
    const { api } = live({ paginationConfig: "laravel" }, () => ({ body: laravelBody(1, 5, 5) }));
    const input = Object.freeze({ query: Object.freeze({ page: 1, pageSize: 5, sort: "-id" }) });
    await expect(api.getAll!(input)).resolves.toBeDefined();
    expect(input.query).toEqual({ page: 1, pageSize: 5, sort: "-id" });
  });
});

describe("request adapter (buildRequest)", () => {
  const adapter = {
    strategy: "cursor",
    buildRequest: (input: { cursor?: string; pageSize?: number }) => ({
      body: { pagination: { after: input.cursor, first: input.pageSize } },
      headers: { "x-page-size": String(input.pageSize ?? "") },
    }),
  };

  it("places pagination in a POST body and headers while keeping other input", async () => {
    const { api, sent } = live(
      {
        paginationConfig: "cursor",
        operations: { search: { method: "POST", path: "/search", pagination: adapter } },
      },
      () => ({ body: { data: [], nextCursor: null } }),
    );
    await api.search!({ filter: "a" }, { query: { cursor: "c1", pageSize: 5 } });
    expect(JSON.parse(String(sent[0]!.body))).toEqual({
      filter: "a",
      pagination: { after: "c1", first: 5 },
    });
    expect(sent[0]!.headers.get("x-page-size")).toBe("5");
    expect(new URL(sent[0]!.url).search).toBe("");
  });

  it("rejects collisions with existing body fields and non-object bodies", async () => {
    const { api, sent } = live(
      { operations: { search: { method: "POST", path: "/s", pagination: adapter } } },
      () => ({ body: { data: [], nextCursor: null } }),
    );
    await expect(api.search!({ pagination: 1 }, { query: { pageSize: 2 } })).rejects.toThrow(
      /collides/,
    );
    await expect(api.search!([1, 2], { query: { pageSize: 2 } })).rejects.toThrow(/plain object/);
    expect(sent).toHaveLength(0);
  });

  it("rejects header injection and bodies on body-less operations", async () => {
    const bad = {
      strategy: "cursor",
      buildRequest: () => ({ headers: { "x-a": "v\r\nInjected: 1" } }),
    };
    const { api } = live({ operations: { list: { method: "GET", path: "/l", pagination: bad } } });
    await expect(api.list!()).rejects.toThrow(/invalid header/);
    const withBody = { strategy: "cursor", buildRequest: () => ({ body: { a: 1 } }) };
    const { api: api2 } = live({
      operations: { list: { method: "GET", path: "/l", pagination: withBody } },
    });
    await expect(api2.list!()).rejects.toThrow(/without one/);
  });

  it("refuses prototype-polluting names", async () => {
    const polluter = {
      strategy: "cursor",
      buildRequest: () => ({ query: JSON.parse('{"__proto__": "x"}') }),
    };
    const { api } = live({
      operations: { list: { method: "GET", path: "/l", pagination: polluter } },
    });
    await expect(api.list!()).rejects.toThrow(/not allowed/);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it("cannot be combined with params or a preset", () => {
    expect(() =>
      live({
        paginationConfig: { strategy: "cursor", params: { cursor: "c" }, buildRequest: () => ({}) },
      }),
    ).toThrow(/buildRequest/);
  });
});

describe("response adapter and pipeline order", () => {
  it("gives parseList the status, headers and request context", async () => {
    let seen: unknown;
    const { api } = live(
      {
        paginationConfig: {
          strategy: "cursor",
          parseList: (
            body: { rows: Row[] },
            ctx: { status: number; headers: Headers; request: unknown },
          ) => {
            seen = { status: ctx.status, link: ctx.headers.get("x-next"), request: ctx.request };
            return { data: body.rows, nextCursor: ctx.headers.get("x-next") };
          },
        },
      },
      () => ({ body: { rows: rows(1) }, headers: { "x-next": "tok" } }),
    );
    const out = await api.getAll!({ query: { pageSize: 3 } });
    expect(out).toEqual({ data: rows(1), nextCursor: "tok" });
    expect(seen).toMatchObject({
      status: 200,
      link: "tok",
      request: { method: "GET", pagination: { pageSize: 3 } },
    });
  });

  it("preserves the raw backend payload as source with { full: true }", async () => {
    const body = laravelBody(1, 2, 2);
    const { api } = live({ paginationConfig: "laravel" }, () => ({ body }));
    const full = (await api.getAll!({ full: true })) as { data: unknown; source: unknown };
    expect(full.source).toEqual(body);
    expect(full.data).toEqual({ data: rows(2), total: 2, page: 1, pageSize: 2 });
  });

  it("transforms entities but leaves pagination metadata keys alone", async () => {
    const { api } = live(
      { paginationConfig: "laravel" },
      () => ({ body: { ...laravelBody(1, 2, 2), data: [{ id: "1", first_name: "A" }] } }),
      { transforms: { response: { keys: "camelCase" } } },
    );
    expect(await api.getAll!()).toEqual({
      data: [{ id: "1", firstName: "A" }],
      total: 2,
      page: 1,
      pageSize: 2,
    });
  });

  it("validates the final contract after response.parse and response middleware", async () => {
    const broken = live(
      {
        paginationConfig: "page",
        response: { parse: (v: Record<string, unknown>) => ({ ...v, page: 0 }) },
      },
      () => ({ body: { data: [], total: 0, page: 1, pageSize: 5 } }),
    );
    await expect(broken.api.getAll!()).rejects.toBeInstanceOf(ParseError);

    const reshaped = live(
      {
        paginationConfig: "page",
        middleware: {
          onResponse: [(res: { data: { data: unknown[] } }) => ({ ...res, data: res.data.data })],
        },
      },
      () => ({ body: { data: [1], total: 1, page: 1, pageSize: 5 } }),
    );
    // ADR-007 Decision 07: final built-in invariants run AFTER onResponse middleware.
    await expect(reshaped.api.getAll!()).rejects.toBeInstanceOf(ParseError);
  });

  it("surfaces malformed envelopes as ParseError carrying the source", async () => {
    const { api } = live({ paginationConfig: "laravel" }, () => ({ body: { nope: true } }));
    await expect(api.getAll!()).rejects.toMatchObject({
      name: "ParseError",
      data: { nope: true },
      status: 200,
    });
  });

  it("rejects non-JSON response types on paginated operations", () => {
    expect(() =>
      live({
        operations: { list: { method: "GET", path: "/l", responseType: "blob", pagination: true } },
      }),
    ).toThrow(/JSON response/);
  });

  it("preserves real HTTP errors", async () => {
    const { api } = live({ paginationConfig: "page" }, () => ({
      status: 500,
      body: { message: "boom" },
    }));
    await expect(api.getAll!()).rejects.toMatchObject({ status: 500 });
  });
});

describe("security of configured names", () => {
  it("rejects unsafe field paths and backend names", () => {
    for (const fields of [{ data: "__proto__" }, { data: "a.constructor.b" }, { total: "a..b" }]) {
      expect(() => live({ paginationConfig: { strategy: "page", fields } })).toThrow(ConfigError);
    }
    expect(() =>
      live({ paginationConfig: { strategy: "page", params: { page: "__proto__" } } }),
    ).toThrow(ConfigError);
  });

  it("reads response fields only from own properties", async () => {
    const inherited = Object.create({ data: [], total: 0, page: 1, pageSize: 1 });
    const { api } = live({ paginationConfig: "laravel" }, () => ({ body: inherited }));
    await expect(api.getAll!()).rejects.toBeInstanceOf(ParseError);
  });
});

describe("navigation helpers", () => {
  const input = Object.freeze({
    query: Object.freeze({ category: "books", page: 2, sort: "name" }),
    params: { org: "a" },
  });

  it("builds next / previous page inputs that keep filters and never mutate", () => {
    const result = { data: rows(2), page: 2, pageSize: 2, total: 7 };
    expect(nextPageInput("page", result, input)).toEqual({
      query: { category: "books", page: 3, sort: "name" },
      params: { org: "a" },
    });
    expect(previousPageInput("page", result, input)).toEqual({
      query: { category: "books", page: 1, sort: "name" },
      params: { org: "a" },
    });
    expect(input.query.page).toBe(2);
  });

  it("knows the end and the start", () => {
    expect(nextPageInput("page", { data: [], page: 4, pageSize: 2, total: 7 }, input)).toBeNull();
    expect(
      previousPageInput("page", { data: [], page: 1, pageSize: 2, total: 7 }, input),
    ).toBeNull();
  });

  it("returns null when availability is unknown or continuation is unconstructible", () => {
    // No total / pageCount / hasMore: unknown availability -> returns null per Decision 09.
    const unknown = nextPageInput("page", { data: rows(2), page: 1, pageSize: 2 }, { query: {} });
    expect(unknown).toBeNull();
    // hasMore without a cursor: more data exists but Apixa cannot build the request -> returns null.
    const stuck = nextPageInput("cursor", { data: rows(1), hasMore: true }, { query: {} });
    expect(stuck).toBeNull();
    expect(nextPageInput("cursor", { data: rows(1) }, { query: {} })).toBeNull();
    expect(nextPageInput("cursor", { data: [], nextCursor: null }, { query: {} })).toBeNull();
  });

  it("uses pageCount and hasMore before a total", () => {
    expect(
      nextPageInput(
        "page",
        { data: [], page: 1, pageSize: 2, pageCount: 1, total: 99 },
        { query: {} },
      ),
    ).toBeNull();
    expect(
      nextPageInput("page", { data: [], page: 1, pageSize: 2, hasMore: true }, { query: {} }),
    ).toEqual({ query: { page: 2 } });
  });

  it("swaps cursor directions without leaking the other key", () => {
    const result = { data: rows(1), nextCursor: "n", previousCursor: "p" };
    expect(nextPageInput("cursor", result, { query: { before: "old", q: 1 } })).toEqual({
      query: { q: 1, cursor: "n" },
    });
    expect(previousPageInput("cursor", result, { query: { cursor: "old" } })).toEqual({
      query: { before: "p" },
    });
  });

  it("does not guess an offset step without a reported continuation", () => {
    const out = nextPageInput("offset", { data: rows(2), offset: 0, hasMore: true }, { query: {} });
    expect(out).toBeNull();
    expect(previousPageInput("offset", { data: [], offset: 0 }, { query: {} })).toBeNull();
  });

  it("keys continuations by everything except the position", () => {
    const a = paginationContextKey({ query: { q: "x", page: 1, cursor: "c" }, params: { id: 1 } });
    const b = paginationContextKey({ query: { page: 9, q: "x" }, params: { id: 1 } });
    expect(a).toBe(b);
    expect(paginationContextKey({ query: { q: "y" }, params: { id: 1 } })).not.toBe(a);
    expect(paginationContextKey({ query: { q: "x" }, params: { id: 1 }, body: { f: 1 } })).not.toBe(
      a,
    );
  });

  it("round-trips through a serialization boundary (no closures in results)", async () => {
    const { api } = live({ paginationConfig: "cursor" }, () => ({
      body: { data: rows(1), nextCursor: "n" },
    }));
    const out = await api.getAll!();
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("mocked pagination", () => {
  function mocked(resource: Record<string, unknown>) {
    return live({ mock: rows(7), ...resource }).api;
  }

  it("page, offset and cursor produce the shared contracts", async () => {
    expect(
      await mocked({ paginationConfig: "page" }).getAll!({ query: { page: 2, pageSize: 3 } }),
    ).toEqual({
      data: rows(3, 4),
      total: 7,
      page: 2,
      pageSize: 3,
    });
    expect(
      await mocked({ paginationConfig: "offset" }).getAll!({ query: { offset: 5, pageSize: 3 } }),
    ).toEqual({
      data: rows(2, 6),
      total: 7,
      offset: 5,
      pageSize: 3,
      nextOffset: null,
    });
    expect(
      await mocked({ paginationConfig: "cursor" }).getAll!({ query: { cursor: "3", pageSize: 3 } }),
    ).toEqual({
      data: rows(3, 4),
      nextCursor: "6",
    });
  });

  it("walks every record exactly once with the navigation helpers", async () => {
    const api = mocked({ paginationConfig: "offset" });
    const seen: string[] = [];
    let input: { query: Record<string, unknown> } = { query: { offset: 0, pageSize: 3 } };
    for (let i = 0; i < 10; i++) {
      const page = (await api.getAll!(input)) as { data: Row[] };
      seen.push(...page.data.map((r) => r.id));
      const next = nextPageInput("offset", page, input);
      if (!next) break;
      input = next;
    }
    expect(seen).toEqual(rows(7).map((r) => r.id));
  });

  it("applies the same logical validation as live calls", async () => {
    const api = mocked({ paginationConfig: "laravel" });
    await expect(api.getAll!({ query: { page: 0 } })).rejects.toBeInstanceOf(ValidationError);
    await expect(api.getAll!({ query: { pageSize: 5, per_page: 9 } })).rejects.toThrow(/per_page/);
    const capped = mocked({ paginationConfig: { strategy: "page", maxPageSize: 2 } });
    await expect(capped.getAll!({ query: { pageSize: 3 } })).rejects.toThrow(/maxPageSize/);
    const defaulted = mocked({ paginationConfig: { strategy: "page", defaultPageSize: 2 } });
    expect(await defaulted.getAll!()).toMatchObject({ pageSize: 2 });
  });

  it("an out-of-range mock page is an empty page, as documented", async () => {
    expect(
      await mocked({ paginationConfig: "page" }).getAll!({ query: { page: 9 } }),
    ).toMatchObject({ data: [], total: 7 });
  });

  it("custom handlers: an array is paginated once, a finished page is not paginated again", async () => {
    const api = mocked({
      operations: {
        listed: { method: "GET", path: "/listed", pagination: "page", mock: () => rows(5) },
        finished: {
          method: "GET",
          path: "/finished",
          pagination: "page",
          mock: () => ({ data: rows(2), total: 50, page: 3, pageSize: 2 }),
        },
        cursor: { method: "GET", path: "/cursor", pagination: "cursor", mock: () => rows(5) },
      },
    });
    expect(await api.listed!({ query: { page: 2, pageSize: 2 } })).toEqual({
      data: rows(2, 3),
      total: 5,
      page: 2,
      pageSize: 2,
    });
    // Returned untouched: the engine does not slice a completed page.
    expect(await api.finished!({ query: { page: 1, pageSize: 1 } })).toEqual({
      data: rows(2),
      total: 50,
      page: 3,
      pageSize: 2,
    });
    expect(await api.cursor!({ query: { pageSize: 2 } })).toEqual({
      data: rows(2),
      nextCursor: "2",
    });
  });

  it("validates a finished page returned by a handler against the contract", async () => {
    const api = mocked({
      operations: {
        bad: {
          method: "GET",
          path: "/bad",
          pagination: "page",
          mock: () => ({ data: rows(1), page: 1 }),
        },
      },
    });
    await expect(api.bad!()).rejects.toBeInstanceOf(ParseError);
  });

  it("paginates getMany only when it opts in", async () => {
    const api = mocked({ operations: { getMany: { pagination: true } } });
    expect(await api.getMany!(["1", "2", "3"], { query: { pageSize: 2 } })).toMatchObject({
      data: rows(2),
      total: 3,
    });
  });
});

describe("type inference", () => {
  type P = { id: string; name: string };
  const api = defineApi<{ products: P }>()({
    baseURL: "https://x.dev",
    transport: createFakeTransport(() => ({ body: {} })),
    resources: {
      products: {
        path: "/products",
        paginationConfig: "offset",
        operations: {
          archived: { method: "GET", path: "/a", pagination: "cursor" },
          stats: { method: "GET", path: "/s", pagination: false },
          shared: { method: "GET", path: "/h", pagination: true },
          custom: {
            method: "GET",
            path: "/c",
            pagination: { strategy: "page", fields: { data: "i", page: "p", pageSize: "n" } },
          },
        },
      },
    },
  });

  it("infers strategy-specific results and queries", () => {
    expectTypeOf(api.products.getAll).returns.resolves.toEqualTypeOf<{
      data: P[];
      offset: number;
      pageSize: number;
      total: number;
      nextOffset?: number | null;
      previousOffset?: number | null;
      hasMore?: boolean;
    }>();
    expectTypeOf(api.products.getAll)
      .parameter(0)
      .toExtend<{ query?: { offset?: number; pageSize?: number } } | undefined>();
    expectTypeOf(api.products.archived).returns.resolves.toExtend<{
      data: unknown[];
      nextCursor: string | null;
    }>();
    expectTypeOf(api.products.shared).returns.resolves.toHaveProperty("offset");
    expectTypeOf(api.products.stats).returns.resolves.not.toHaveProperty("data");
  });

  it("makes total optional only for custom mappings that do not declare it", () => {
    type Custom = Awaited<ReturnType<typeof api.products.custom>>;
    expectTypeOf<Custom["total"]>().toEqualTypeOf<number | undefined>();
    type Shared = Awaited<ReturnType<typeof api.products.getAll>>;
    expectTypeOf<Shared["total"]>().toEqualTypeOf<number>();
  });
});
