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
            return { body: { payload: { list: [{ id: 1, full_name: "Ada" }] }, meta: { count: 1 } } };
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
                  validate: (value) => (value as Array<{ id: number; fullName: string }>).map((u) => ({ ...u })),
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
      for (const badPath of ["", ".data", "data.", "a..b", "__proto__.x", "constructor", "a.prototype.b"]) {
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
      const _cfg: KeyTransformConfig = { keys: "camelCase", exclude: ["x"], preserve: ["y"], maxDepth: 8 };
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
        middleware: [
          {
            onResponse: (res) => {
              middlewareSource = res.source;
              middlewareData = res.data;
              return { ...res, data: { ...(res.data as Record<string, unknown>), patched: true } };
            },
          },
        ],
        resources: { users: { path: "/users" } },
      });

      const full = (await api.users.getById(42, { full: true })) as ApiResponse<unknown>;
      expect(middlewareSource).toEqual(envelope);
      expect(middlewareData).toEqual({ userId: 42, displayName: "Ada" });
      expect(full.source).toEqual(envelope);
      expect(full.data).toEqual({ userId: 42, displayName: "Ada", patched: true });
    });
  });
});
