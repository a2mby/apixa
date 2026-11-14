import {
  ConfigError,
  defineApi,
  ParseError,
  ResponseShapeError,
  TransformError,
  transformKeys,
  ValidationError,
  type ApiResponse,
  type KeyTransformConfig,
  type ResponseHookContext,
  type ResponseOptions,
  type TransformKeys,
} from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";
import { createFetchTransport } from "../../packages/core/src/transport/fetch.js";

describe("response pipeline (v3 Decisions 22-27)", () => {
  describe("Decision 22: strict JSON default and explicit auto negotiation", () => {
    function makeFetchApi(init: { status?: number; body?: BodyInit | null; contentType?: string }) {
      const fetchImpl = (async () =>
        new Response(init.body ?? null, {
          status: init.status ?? 200,
          headers: init.contentType ? { "content-type": init.contentType } : undefined,
        })) as typeof fetch;
      return defineApi({
        baseURL: "https://api.example.com",
        transport: createFetchTransport(fetchImpl),
        resources: {
          items: {
            path: "/items",
            operations: {
              autoOp: { kind: "read", method: "GET", path: "/auto", responseType: "auto" },
            },
          },
        },
      });
    }

    it("rejects non-JSON content types and HTML under default strict json", async () => {
      const htmlApi = makeFetchApi({ body: "<html>nope</html>", contentType: "text/html" });
      await expect(htmlApi.items.getAll()).rejects.toBeInstanceOf(ParseError);

      const textApi = makeFetchApi({ body: "hello", contentType: "text/plain" });
      await expect(textApi.items.getAll()).rejects.toBeInstanceOf(ParseError);
    });

    it("parses or falls back cleanly when responseType is explicitly auto", async () => {
      const jsonOpaque = makeFetchApi({
        body: '[{"id":"1"}]',
        contentType: "application/octet-stream",
      });
      await expect(jsonOpaque.items.autoOp()).resolves.toEqual([{ id: "1" }]);

      const plainText = makeFetchApi({
        body: "plain text",
        contentType: "text/plain",
      });
      await expect(plainText.items.autoOp()).resolves.toBe("plain text");
    });

    it("handles 204/205 empty bodies without running hooks", async () => {
      let unwrapCalled = 0;
      let parseCalled = 0;
      let validateCalled = 0;
      const api = defineApi({
        baseURL: "https://api.example.com",
        transport: createFakeTransport((req) => ({
          status: req.url.endsWith("/205") ? 205 : 204,
          body: null,
        })),
        response: {
          unwrap: () => {
            unwrapCalled++;
            return null;
          },
          parse: () => {
            parseCalled++;
            return null;
          },
          validate: () => {
            validateCalled++;
            return null;
          },
        },
        resources: {
          items: {
            path: "/items",
            operations: {
              clear205: { kind: "read", method: "GET", path: "/205" },
            },
          },
        },
      });

      await expect(api.items.getById("1")).resolves.toBeNull();
      await expect(api.items.clear205()).resolves.toBeNull();
      expect(unwrapCalled).toBe(0);
      expect(parseCalled).toBe(0);
      expect(validateCalled).toBe(0);
    });
  });

  describe("Decision 23: inherited response.{unwrap, parse, validate} and opt-out", () => {
    it("inherits root -> resource -> operation response options and supports false opt-out", async () => {
      const seenContexts: ResponseHookContext[] = [];
      const api = defineApi<{
        users: { entity: { id: number; fullName: string } };
        health: { entity: { ok: boolean } };
      }>()({
        baseURL: "https://api.example.com",
        transport: createFakeTransport((req) => {
          if (req.url.endsWith("/users")) {
            return {
              body: { payload: { list: [{ id: 1, full_name: "Ada" }] }, meta: { count: 1 } },
            };
          }
          if (req.url.endsWith("/users/1")) {
            return { body: { data: { item: { id: 1, full_name: "Ada" } } } };
          }
          return { body: { ok: true } };
        }),
        transforms: { response: { keys: "camelCase" } },
        response: {
          unwrap: "data.item",
          validate: async (value, ctx) => {
            seenContexts.push(ctx);
            return value;
          },
        },
        resources: {
          users: {
            path: "/users",
            operations: {
              getAll: {
                response: {
                  unwrap: "payload.list",
                  validate: (value) =>
                    (value as Array<{ id: number; fullName: string }>).map((u) => ({ ...u })),
                },
              },
            },
          },
          health: {
            path: "/health",
            response: {
              unwrap: false,
            },
          },
        },
      });

      const list = await api.users.getAll();
      expect(list).toEqual([{ id: 1, fullName: "Ada" }]);
      const single = await api.users.getById(1);
      expect(single).toEqual({ id: 1, fullName: "Ada" });
      expect(seenContexts).toHaveLength(1);
      expect(seenContexts[0]).toMatchObject({
        status: 200,
        resource: "users",
        operation: "getById",
      });

      const health = await api.health.getById(1);
      expect(health).toEqual({ ok: true });
    });

    it("rejects unsafe or malformed response.unwrap paths at construction", () => {
      for (const badPath of [
        "",
        ".data",
        "data.",
        "a..b",
        "__proto__.x",
        "constructor",
        "a.prototype.b",
      ]) {
        expect(() =>
          defineApi({
            baseURL: "https://api.example.com",
            response: { unwrap: badPath },
            resources: { users: { path: "/users" } },
          }),
        ).toThrow(ConfigError);
      }
    });

    it("throws ResponseShapeError with source context when unwrap path is missing or non-object", async () => {
      const sourceBody = { payload: "not-an-object" };
      const api = defineApi({
        baseURL: "https://api.example.com",
        transport: createFakeTransport(() => ({ status: 200, body: sourceBody })),
        response: { unwrap: "payload.nested" },
        resources: { users: { path: "/users" } },
      });

      await expect(api.users.getById("1")).rejects.toMatchObject({
        code: "RESPONSE_SHAPE",
        status: 200,
        data: sourceBody,
        response: { status: 200, data: sourceBody, source: sourceBody },
      });
    });

    it("supports async response.unwrap functions and wraps thrown non-ApiError errors", async () => {
      const sourceBody = { envelope: { id: 7 } };
      const api = defineApi({
        baseURL: "https://api.example.com",
        transport: createFakeTransport(() => ({ status: 200, body: sourceBody })),
        resources: {
          users: {
            path: "/users",
            operations: {
              ok: {
                kind: "read",
                method: "GET",
                path: "/ok",
                response: { unwrap: async (raw) => (raw as typeof sourceBody).envelope },
              },
              fail: {
                kind: "read",
                method: "GET",
                path: "/fail",
                response: {
                  unwrap: async () => {
                    throw new Error("bad envelope");
                  },
                },
              },
            },
          },
        },
      });

      await expect(api.users.ok()).resolves.toEqual({ id: 7 });
      const err = await api.users.fail().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ResponseShapeError);
      expect(err).toMatchObject({ status: 200, data: sourceBody });
    });
  });

  describe("Decision 24: builtin structural shape enforcement", () => {
    it("enforces builtin response shapes across count, createMany, single-entity ops, and getAll", async () => {
      const api = defineApi({
        baseURL: "https://api.example.com",
        transport: createFakeTransport((req) => {
          if (req.url.endsWith("/count")) return { body: "3" };
          if (req.url.endsWith("/bulk")) return { body: { created: 2 } };
          if (req.url.endsWith("/users/204")) return { status: 204, body: null };
          if (req.url.endsWith("/users/bad")) return { status: 200, body: ["not-an-object"] };
          if (req.url.endsWith("/users")) return { status: 200, body: 123 };
          return { status: 200, body: "scalar" };
        }),
        resources: { users: { path: "/users" } },
      });

      await expect(api.users.count()).rejects.toBeInstanceOf(ResponseShapeError);
      await expect(api.users.createMany([{}])).rejects.toBeInstanceOf(ResponseShapeError);
      await expect(api.users.getById("bad")).rejects.toBeInstanceOf(ResponseShapeError);
      await expect(api.users.getById("204")).resolves.toBeNull();
      await expect(api.users.create({})).rejects.toBeInstanceOf(ResponseShapeError);
      await expect(api.users.update("1", { body: {} })).rejects.toBeInstanceOf(ResponseShapeError);
      await expect(api.users.patch("1", { body: {} })).rejects.toBeInstanceOf(ResponseShapeError);
      await expect(api.users.getAll()).rejects.toBeInstanceOf(ResponseShapeError);
    });
  });

  describe("Decision 25: response.parse and response.validate hooks", () => {
    it("supports sync/async response.parse and response.validate and attaches source metadata on failure", async () => {
      const rawBody = { user_id: "10", role: "admin" };
      const api = defineApi({
        baseURL: "https://api.example.com",
        transport: createFakeTransport(() => ({ status: 200, body: rawBody })),
        resources: {
          users: {
            path: "/users",
            operations: {
              parsed: {
                kind: "read",
                method: "GET",
                path: "/parsed",
                response: {
                  parse: async (data) => {
                    const obj = data as { user_id: string; role: string };
                    return { id: Number(obj.user_id), role: obj.role };
                  },
                  validate: async (data) => {
                    const parsed = data as { id: number; role: string };
                    return { ...parsed, checked: true };
                  },
                },
              },
              badParse: {
                kind: "read",
                method: "GET",
                path: "/bad-parse",
                response: {
                  parse: () => {
                    throw new Error("cannot parse custom payload");
                  },
                },
              },
              badValidate: {
                kind: "read",
                method: "GET",
                path: "/bad-validate",
                response: {
                  validate: async () => {
                    throw new Error("schema mismatch");
                  },
                },
              },
            },
          },
        },
      });

      await expect(api.users.parsed()).resolves.toEqual({ id: 10, role: "admin", checked: true });

      const parseErr = await api.users.badParse().catch((e: unknown) => e);
      expect(parseErr).toBeInstanceOf(ValidationError);
      expect(parseErr).toMatchObject({ status: 200, data: rawBody });

      const valErr = await api.users.badValidate().catch((e: unknown) => e);
      expect(valErr).toBeInstanceOf(ValidationError);
      expect(valErr).toMatchObject({ status: 200, data: rawBody });
    });

    it("still applies builtin fromHttp shaping and checks after inherited response.parse", async () => {
      const parseCalls: string[] = [];
      const api = defineApi<{
        users: { entity: { id: number; parsed?: boolean } };
      }>()({
        baseURL: "https://api.example.com",
        transport: createFakeTransport((req) => {
          const url = new URL(req.url);
          if (url.pathname === "/users/999") return { status: 404, body: { error: "missing" } };
          if (url.pathname === "/users/count") {
            return { status: 200, body: url.searchParams.get("bad") ? "nope" : "42" };
          }
          if (url.pathname === "/users/1") return { status: 200, body: { id: "1" } };
          if (url.pathname === "/users" && url.searchParams.get("empty") === "1") {
            return { status: 200, body: [] };
          }
          if (url.pathname === "/users" && url.searchParams.get("bad") === "1") {
            return { status: 200, body: "not-a-list" };
          }
          if (url.pathname === "/users") {
            return { status: 200, body: [{ id: "1" }, { id: "2" }] };
          }
          return { status: 200, body: [] };
        }),
        response: {
          parse: (data, ctx) => {
            parseCalls.push(ctx.operation);
            if (Array.isArray(data)) {
              return data.map((row) =>
                typeof row === "object" && row !== null
                  ? {
                      ...(row as Record<string, unknown>),
                      id: Number((row as { id: string }).id),
                      parsed: true,
                    }
                  : row,
              );
            }
            if (typeof data === "object" && data !== null && "id" in data) {
              return { ...data, id: Number((data as { id: string }).id), parsed: true };
            }
            return data;
          },
        },
        resources: {
          users: {
            path: "/users",
            operations: {
              count: {
                response: {
                  parse: (data) =>
                    typeof data === "string" && /^\d+$/.test(data) ? Number(data) : data,
                },
              },
            },
          },
        },
      });

      await expect(api.users.exists(1)).resolves.toBe(true);
      await expect(api.users.exists(999)).resolves.toBe(false);
      await expect(api.users.findFirst({ query: { id: 1 } })).resolves.toEqual({
        id: 1,
        parsed: true,
      });
      await expect(api.users.findFirst({ query: { empty: "1" } })).resolves.toBeNull();
      await expect(api.users.getBy("id", 1)).resolves.toEqual({ id: 1, parsed: true });
      await expect(api.users.getById(1)).resolves.toEqual({ id: 1, parsed: true });
      await expect(api.users.getAll()).resolves.toEqual([
        { id: 1, parsed: true },
        { id: 2, parsed: true },
      ]);
      await expect(api.users.count()).resolves.toBe(42);
      await expect(api.users.count({ query: { bad: "1" } })).rejects.toBeInstanceOf(
        ResponseShapeError,
      );
      await expect(api.users.getMany([1], { query: { bad: "1" } })).rejects.toBeInstanceOf(
        ResponseShapeError,
      );
      expect(parseCalls).toContain("exists");
      expect(parseCalls).toContain("findFirst");
      expect(parseCalls).toContain("getBy");
      expect(parseCalls).toContain("getById");
      expect(parseCalls).toContain("getAll");
    });
  });

  describe("Decision 26: safe key transforms (cycles, DAG, maxDepth, exclude/preserve)", () => {
    it("detects circular references with TransformError while permitting shared DAG references", () => {
      const shared = { nested_key: 1 };
      const dag = { first_branch: shared, second_branch: shared };
      expect(transformKeys(dag, "camelCase")).toEqual({
        firstBranch: { nestedKey: 1 },
        secondBranch: { nestedKey: 1 },
      });

      const cycle: Record<string, unknown> = { user_id: 1 };
      cycle.self_ref = cycle;
      expect(() => transformKeys(cycle, "camelCase")).toThrow(TransformError);
    });

    it("enforces maxDepth and supports exclude and preserve with key names, dot-paths, and wildcards", async () => {
      const deep = { a_b: { c_d: { e_f: { g_h: 1 } } } };
      expect(() => transformKeys(deep, "camelCase", { maxDepth: 2 })).toThrow(TransformError);

      const transformed = transformKeys(
        {
          user_id: 1,
          raw_meta: { keep_snake: true },
          profile: {
            display_name: "Ada",
            custom_attrs: { foo_bar: 1 },
          },
          items: [
            { item_id: 10, raw_attrs: { inner_key: "x" } },
            { item_id: 11, raw_attrs: { inner_key: "y" } },
          ],
          by_id: {
            first_entry: { meta_map: { raw_flag: true } },
          },
        },
        "camelCase",
        {
          exclude: ["raw_meta", "profile.custom_attrs"],
          preserve: ["items.raw_attrs", "by_id.*.meta_map"],
        },
      );
      expect(transformed).toEqual({
        userId: 1,
        raw_meta: { keep_snake: true },
        profile: {
          displayName: "Ada",
          custom_attrs: { foo_bar: 1 },
        },
        items: [
          { itemId: 10, rawAttrs: { inner_key: "x" } },
          { itemId: 11, rawAttrs: { inner_key: "y" } },
        ],
        byId: {
          firstEntry: { metaMap: { raw_flag: true } },
        },
      });

      const api = defineApi({
        baseURL: "https://api.example.com",
        transforms: {
          response: {
            keys: "camelCase",
            exclude: ["raw_payload"],
            preserve: ["meta_map"],
            maxDepth: 10,
          },
        },
        transport: createFakeTransport(() => ({
          body: { user_id: 1, raw_payload: { nested_a: 1 }, meta_map: { key_b: 2 } },
        })),
        resources: { users: { path: "/users" } },
      });

      await expect(api.users.getById(1)).resolves.toEqual({
        userId: 1,
        raw_payload: { nested_a: 1 },
        metaMap: { key_b: 2 },
      });

      type SourceType = {
        user_id: number;
        raw_payload: { nested_a: number };
        meta_map: { key_b: number };
      };
      expectTypeOf<
        TransformKeys<
          SourceType,
          { keys: "camelCase"; exclude: ["raw_payload"]; preserve: ["meta_map"] }
        >
      >().toEqualTypeOf<{
        userId: number;
        raw_payload: { nested_a: number };
        metaMap: { key_b: number };
      }>();

      // Ensure exported v3 response & transform types remain usable
      const _cfg: KeyTransformConfig = {
        keys: "camelCase",
        exclude: ["x"],
        preserve: ["y"],
        maxDepth: 8,
      };
      const _resOpts: ResponseOptions = { unwrap: "data", validate: (v) => v };
      expect(_cfg.maxDepth).toBe(8);
      expect(_resOpts.unwrap).toBe("data");
    });
  });

  describe("Decision 27: source preservation across full: true and response middleware", () => {
    it("preserves parsed response.source alongside processed response.data in middleware and full: true", async () => {
      const envelope = {
        data: { user_id: 42, display_name: "Ada" },
        meta: { request_id: "req-9" },
      };
      let middlewareSource: unknown;
      let middlewareData: unknown;

      const api = defineApi({
        baseURL: "https://api.example.com",
        transport: createFakeTransport(() => ({ status: 200, body: envelope })),
        transforms: { response: { keys: "camelCase" } },
        response: { unwrap: "data" },
        middleware: {
          onResponse: [
            (res) => {
              middlewareSource = res.source;
              middlewareData = res.data;
              return { ...res, data: { ...(res.data as Record<string, unknown>), patched: true } };
            },
          ],
        },
        resources: { users: { path: "/users" } },
      });

      const full = (await api.users.getById(42, { full: true })) as ApiResponse<unknown>;
      expect(middlewareSource).toEqual(envelope);
      expect(middlewareData).toEqual({ userId: 42, displayName: "Ada" });
      expect(full.source).toEqual(envelope);
      expect(full.data).toEqual({ userId: 42, displayName: "Ada", patched: true });
    });
  });

  describe("Bugbot #3 & response pipeline audit regressions", () => {
    it("rejects unpaginated getAll plain objects with ResponseShapeError while allowing arrays and configured pagination", async () => {
      const api = defineApi({
        baseURL: "https://api.example.com",
        transport: createFakeTransport((req) => {
          if (req.url.endsWith("/envelope")) {
            return { body: { data: [{ id: "1" }], nextCursor: "n1" } };
          }
          if (req.url.endsWith("/sliced")) {
            return { body: { items: [{ id: "1" }] } };
          }
          if (req.url.endsWith("/laravel")) {
            return {
              body: {
                data: [{ id: "1" }],
                links: { next: null },
                meta: { current_page: 1, per_page: 10, total: 1, last_page: 1 },
              },
            };
          }
          return { body: [{ id: "1" }] };
        }),
        resources: {
          envelope: { path: "/envelope" },
          sliced: { path: "/sliced", slice: 1 },
          plain: { path: "/plain" },
          laravel: { path: "/laravel", pagination: "laravel" },
        },
      });

      await expect(api.envelope.getAll()).rejects.toBeInstanceOf(ResponseShapeError);
      await expect(api.sliced.getAll()).rejects.toBeInstanceOf(ResponseShapeError);
      await expect(api.plain.getAll()).resolves.toEqual([{ id: "1" }]);
      await expect(api.laravel.getAll()).resolves.toEqual({
        data: [{ id: "1" }],
        total: 1,
        page: 1,
        pageSize: 10,
      });
    });

    it("skips unwrap, transforms, response.parse, response.validate, and builtin fromHttp on non-JSON responseType", async () => {
      let unwrapCalls = 0;
      let parseCalls = 0;
      let validateCalls = 0;
      const fetchImpl = (async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.endsWith("/missing")) {
          return new Response("missing-text", {
            status: 404,
            headers: { "content-type": "text/plain" },
          });
        }
        return new Response("hello_world", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }) as typeof fetch;

      const api = defineApi({
        baseURL: "https://api.example.com",
        transport: createFetchTransport(fetchImpl),
        transforms: { response: { keys: "camelCase" } },
        response: {
          unwrap: () => {
            unwrapCalls++;
            return null;
          },
          parse: () => {
            parseCalls++;
            return null;
          },
          validate: () => {
            validateCalls++;
            return null;
          },
        },
        resources: {
          files: {
            path: "/files",
            operations: {
              textOp: { kind: "read", method: "GET", path: "/note", responseType: "text" },
            },
          },
        },
      });

      const textRes = await api.files.textOp();
      expectTypeOf(textRes).toEqualTypeOf<string>();
      expect(textRes).toBe("hello_world");

      const getByIdText = await api.files.getById("1", { responseType: "text" });
      expectTypeOf(getByIdText).toEqualTypeOf<string>();
      expect(getByIdText).toBe("hello_world");

      const getByIdBlob = await api.files.getById("1", { responseType: "blob" });
      expectTypeOf(getByIdBlob).toEqualTypeOf<Blob>();
      expect(getByIdBlob).toBeInstanceOf(Blob);
      expect(await getByIdBlob.text()).toBe("hello_world");

      const getByText = await api.files.getBy("slug", "intro", { responseType: "text" });
      expectTypeOf(getByText).toEqualTypeOf<string>();
      expect(getByText).toBe("hello_world");

      await expect(api.files.exists("missing")).resolves.toBe(false);

      expect(unwrapCalls).toBe(0);
      expect(parseCalls).toBe(0);
      expect(validateCalls).toBe(0);
    });

    it("runs response.parse on mocked builtins and custom mock handlers while keeping TS contracts aligned", async () => {
      const api = defineApi({
        baseURL: "/api",
        resources: {
          users: {
            path: "/users",
            mock: [{ id: 1, first_name: "Ada" }],
            operations: {
              getById: {
                response: {
                  parse: (data) => {
                    const row = data as { id: number; first_name: string };
                    return { id: row.id, displayName: row.first_name.toUpperCase() };
                  },
                },
              },
              summary: {
                kind: "read",
                method: "GET",
                path: "/summary",
                mock: ({ records }) => ({ count: records.length }),
                response: {
                  parse: (data) => `users:${(data as { count: number }).count}`,
                },
              },
            },
          },
        },
      });

      const user = await api.users.getById(1);
      expectTypeOf(user).toEqualTypeOf<{ id: number; displayName: string }>();
      expect(user).toEqual({ id: 1, displayName: "ADA" });

      const summary = await api.users.summary();
      expectTypeOf(summary).toEqualTypeOf<string>();
      expect(summary).toBe("users:1");
    });

    it("does not let root/resource response.unwrap strip pagination metadata before Laravel parsePage", async () => {
      const api = defineApi<{
        items: { entity: { id: string; itemName: string } };
      }>()({
        baseURL: "https://api.example.com",
        transport: createFakeTransport(() => ({
          body: {
            data: [{ id: "1", item_name: "Pen" }],
            links: { next: null },
            meta: { current_page: 2, per_page: 10, total: 31, last_page: 4 },
          },
        })),
        response: { unwrap: "data" },
        transforms: { response: { keys: "camelCase" } },
        resources: {
          items: { path: "/items", pagination: "laravel" },
        },
      });

      const page = await api.items.getAll({ query: { page: 2, pageSize: 10 } });
      expect(page).toEqual({
        data: [{ id: "1", itemName: "Pen" }],
        total: 31,
        page: 2,
        pageSize: 10,
      });
    });
  });
});

describe("final builtin contracts on live and normalized mocks", () => {
  it.each([false, true])("rejects malformed parsed builtin results (mock=%s)", async (mocked) => {
    const api = defineApi({
      baseURL: "https://example.com",
      transport: createFakeTransport((req) => ({
        body: req.url.endsWith("/count") ? 1 : [{ id: 1 }],
      })),
      resources: {
        users: {
          path: "/users",
          ...(mocked ? { mock: [{ id: 1 }] } : {}),
          response: { parse: () => "invalid" },
        },
      },
    });
    for (const call of [
      () => api.users.getAll(),
      () => api.users.getMany([1]),
      () => api.users.findFirst(),
      () => api.users.getBy("id", 1),
      () => api.users.getById(1),
      () => api.users.count(),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(ResponseShapeError);
    }
    // Live exists is status-based; mock exists must remain boolean even after parsing.
    if (mocked) await expect(api.users.exists(1)).rejects.toBeInstanceOf(ResponseShapeError);
  });
  it.each([false, true])(
    "validates replacements returned by response.validate (mock=%s)",
    async (mocked) => {
      const api = defineApi({
        baseURL: "https://example.com",
        transport: createFakeTransport(() => ({ body: [{ id: 1 }] })),
        resources: {
          users: {
            path: "/users",
            ...(mocked ? { mock: [{ id: 1 }] } : {}),
            response: { validate: () => ({ invalid: true }) },
          },
        },
      });
      await expect(api.users.getAll()).rejects.toBeInstanceOf(ResponseShapeError);
    },
  );
  it("preserves already-shaped mock scalars and entities without double shaping", async () => {
    const api = defineApi({
      baseURL: "/api",
      response: { parse: async (data) => data, validate: async () => undefined },
      resources: {
        users: { path: "/users", mock: [{ id: 1, name: "Ada" }] },
      },
    });
    expect(await api.users.exists(1)).toBe(true);
    expect(await api.users.count()).toBe(1);
    expect(await api.users.findFirst()).toEqual({ id: 1, name: "Ada" });
    expect(await api.users.findFirst({ query: { name: "Missing" } })).toBeNull();
    const full = await api.users.getAll({ full: true });
    expect(full.data).toEqual(full.source);
  });
});

describe("write response contracts", () => {
  it.each([false, true])(
    "rejects malformed parsed create/update/patch/bulk results (mock=%s)",
    async (mocked) => {
      const api = defineApi({
        baseURL: "https://example.com",
        transport: createFakeTransport(() => ({ body: { id: 1 } })),
        resources: {
          users: {
            path: "/users",
            ...(mocked ? { mock: [{ id: 1, name: "Ada" }] } : {}),
            response: { parse: () => "invalid" },
          },
        },
      });
      for (const call of [
        () => api.users.create({ name: "Grace" }),
        () => api.users.update(1, { body: { name: "Grace" } }),
        () => api.users.patch(1, { body: { name: "Grace" } }),
        () => api.users.createMany([{ name: "Grace" }]),
      ]) {
        await expect(call()).rejects.toBeInstanceOf(ResponseShapeError);
      }
    },
  );
});

describe("inherited response stages on normalized mocks", () => {
  it.each([false, true])(
    "preserves unwrap/parse/validate, source and middleware (mock=%s)",
    async (mocked) => {
      const calls: string[] = [];
      const api = defineApi({
        baseURL: "https://example.com",
        transport: createFakeTransport(() => ({ body: { data: [{ id: 1, name: "Ada" }] } })),
        response: {
          unwrap: "data",
          parse: async (data) => {
            calls.push("parse");
            return data;
          },
          validate: async () => {
            calls.push("validate");
          },
        },
        middleware: {
          onResponse: [
            (response) => {
              calls.push("middleware");
              return response;
            },
          ],
          onError: [
            () => {
              calls.push("error");
            },
          ],
        },
        resources: {
          users: { path: "/users", ...(mocked ? { mock: [{ id: 1, name: "Ada" }] } : {}) },
        },
      });
      const full = await api.users.getAll({ full: true });
      expect(full.data).toEqual([{ id: 1, name: "Ada" }]);
      expect(full.source).toEqual(
        mocked ? [{ id: 1, name: "Ada" }] : { data: [{ id: 1, name: "Ada" }] },
      );
      expect(calls).toEqual(["parse", "validate", "middleware"]);
    },
  );
  it("routes final contract failures through error recovery with original source", async () => {
    let source: unknown;
    const api = defineApi({
      baseURL: "/api",
      response: { parse: () => ({ bad: true }) },
      middleware: {
        onError: [
          (error) => {
            source = (error as ResponseShapeError).response?.source;
            return [];
          },
        ],
      },
      resources: {
        users: { path: "/users", mock: [{ id: 1 }] },
      },
    });
    expect(await api.users.getAll()).toEqual([]);
    expect(source).toEqual([{ id: 1 }]);
  });
});
