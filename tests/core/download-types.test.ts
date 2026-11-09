import { defineApi, type ApiResponse } from "@apixa/core";
import { describe, expectTypeOf, it } from "vitest";

/**
 * v1.2.0 type-level contract for binary responses. Compile-time only: every client is built in a
 * function that is never called; `tsc -p tests/tsconfig.json` checks these assertions.
 */

type IsAny<T> = 0 extends 1 & T ? true : false;
type Doc = { id: string; name: string };
type AppApi = { docs: { path: "/docs"; entity: Doc } };
const baseURL = "https://api.example.com";

const declared = () =>
  defineApi<AppApi>()({
    baseURL,
    resources: {
      docs: {
        path: "/docs",
        operations: {
          download: { kind: "read", method: "GET", path: "/:id/file", responseType: "blob" },
          buffer: { kind: "read", method: "GET", path: "/:id/raw", responseType: "arrayBuffer" },
          note: { kind: "read", method: "GET", path: "/:id/note", responseType: "text" },
          tail: { kind: "read", method: "GET", path: "/:id/tail", responseType: "stream" },
          plain: { kind: "read", method: "GET", path: "/:id/plain", responseType: "json" },
          report: { kind: "write", method: "POST", path: "/report", responseType: "blob" },
          // The builtin keeps its entity convention but returns a blob here.
          getById: { responseType: "blob" },
        },
      },
    },
  });

const withMetadata = () =>
  defineApi<{
    docs: {
      path: "/docs";
      entity: Doc;
      operations: { download: { response: Blob }; typed: { response: { ok: true } } };
    };
  }>()({
    baseURL,
    resources: {
      docs: {
        path: "/docs",
        operations: {
          download: { kind: "read", method: "GET", path: "/:id/file", responseType: "blob" },
          // metadata wins over the literal responseType
          typed: { kind: "read", method: "GET", path: "/:id/typed", responseType: "text" },
        },
      },
    },
  });

const functions = () =>
  defineApi<AppApi>()({
    baseURL,
    resources: {
      docs: {
        path: "/docs",
        operations: {
          blobFn: {
            kind: "read",
            run: (ctx, id: string) => ctx.request({ path: `/${id}`, responseType: "blob" }),
          },
          fullFn: {
            kind: "read",
            run: (ctx, id: string) =>
              ctx.request({ path: `/${id}`, responseType: "arrayBuffer", full: true }),
          },
          textFn: {
            kind: "read",
            run: (ctx) => ctx.request({ path: "/n", responseType: "text" }),
          },
          streamFn: {
            kind: "read",
            run: (ctx) => ctx.request({ path: "/s", responseType: "stream" }),
          },
          genericFn: {
            kind: "read",
            run: (ctx, id: string) => ctx.request<Doc>({ path: `/${id}`, responseType: "blob" }),
          },
          jsonFn: { kind: "read", run: (ctx) => ctx.request<Doc[]>({ path: "/" }) },
        },
      },
    },
  });

const plain = () => defineApi<AppApi>()({ baseURL, resources: { docs: { path: "/docs" } } });

describe("binary response types", () => {
  it("declarative operations infer the result type from a literal responseType", () => {
    type Api = ReturnType<typeof declared>["docs"];
    expectTypeOf<ReturnType<Api["download"]>>().toEqualTypeOf<Promise<Blob>>();
    expectTypeOf<ReturnType<Api["buffer"]>>().toEqualTypeOf<Promise<ArrayBuffer>>();
    expectTypeOf<ReturnType<Api["note"]>>().toEqualTypeOf<Promise<string>>();
    expectTypeOf<ReturnType<Api["tail"]>>().toEqualTypeOf<
      Promise<ReadableStream<Uint8Array> | null>
    >();
    expectTypeOf<ReturnType<Api["report"]>>().toEqualTypeOf<Promise<Blob>>();
    expectTypeOf<Parameters<Api["download"]>[0]>().toEqualTypeOf<string>();
    expectTypeOf<IsAny<Awaited<ReturnType<Api["download"]>>>>().toEqualTypeOf<false>();
    // "json" and absent keep the existing derivation
    expectTypeOf<Awaited<ReturnType<Api["plain"]>>>().toEqualTypeOf<unknown>();
  });

  it("an override of a builtin keeps its arguments and changes the result", () => {
    type Api = ReturnType<typeof declared>["docs"];
    expectTypeOf<Awaited<ReturnType<Api["getById"]>>>().toEqualTypeOf<Blob>();
    expectTypeOf<Parameters<Api["getById"]>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Awaited<ReturnType<Api["getAll"]>>>().not.toEqualTypeOf<Blob>();
  });

  it("defineApi<T>() metadata response wins over the runtime responseType", () => {
    type Api = ReturnType<typeof withMetadata>["docs"];
    expectTypeOf<Awaited<ReturnType<Api["download"]>>>().toEqualTypeOf<Blob>();
    expectTypeOf<Awaited<ReturnType<Api["typed"]>>>().toEqualTypeOf<{ ok: true }>();
  });

  it("a per-call literal responseType replaces the data type, with and without full", () => {
    // Never invoked: the assertions are compile-time only (no network).
    const check = () => {
      const api = plain();
      type Docs = typeof api.docs;
      type GetById = Docs["getById"];
      expectTypeOf(api.docs.getById("1")).resolves.toEqualTypeOf<Doc>();
      expectTypeOf(api.docs.getById("1", { responseType: "blob" })).resolves.toEqualTypeOf<Blob>();
      expectTypeOf(
        api.docs.getById("1", { responseType: "arrayBuffer" }),
      ).resolves.toEqualTypeOf<ArrayBuffer>();
      expectTypeOf(
        api.docs.getById("1", { responseType: "text" }),
      ).resolves.toEqualTypeOf<string>();
      expectTypeOf(
        api.docs.getById("1", { responseType: "stream" }),
      ).resolves.toEqualTypeOf<ReadableStream<Uint8Array> | null>();
      expectTypeOf(api.docs.getById("1", { responseType: "json" })).resolves.toEqualTypeOf<Doc>();
      expectTypeOf(
        api.docs.getById("1", { responseType: "blob", full: true }),
      ).resolves.toEqualTypeOf<ApiResponse<Blob>>();
      expectTypeOf(api.docs.getById("1", { full: true })).resolves.toEqualTypeOf<
        ApiResponse<Doc>
      >();
      const widened: "blob" | "json" = Math.random() > 0.5 ? "blob" : "json";
      expectTypeOf(api.docs.getById("1", { responseType: widened })).resolves.toEqualTypeOf<
        Doc | Blob
      >();
      expectTypeOf<IsAny<Awaited<ReturnType<GetById>>>>().toEqualTypeOf<false>();
    };
    void check;
  });

  it("ctx.request infers binary results and keeps request<T>()", () => {
    type Api = ReturnType<typeof functions>["docs"];
    expectTypeOf<ReturnType<Api["blobFn"]>>().toEqualTypeOf<Promise<Blob>>();
    expectTypeOf<ReturnType<Api["fullFn"]>>().toEqualTypeOf<Promise<ApiResponse<ArrayBuffer>>>();
    expectTypeOf<ReturnType<Api["textFn"]>>().toEqualTypeOf<Promise<string>>();
    expectTypeOf<ReturnType<Api["streamFn"]>>().toEqualTypeOf<
      Promise<ReadableStream<Uint8Array> | null>
    >();
    expectTypeOf<ReturnType<Api["genericFn"]>>().toEqualTypeOf<Promise<Doc>>();
    expectTypeOf<ReturnType<Api["jsonFn"]>>().toEqualTypeOf<Promise<Doc[]>>();
  });

  it("plain clients are unchanged", () => {
    const check = () => {
      const api = plain();
      expectTypeOf(api.docs.getAll()).resolves.toEqualTypeOf<Doc[]>();
      expectTypeOf(api.docs.getById("1")).resolves.toEqualTypeOf<Doc>();
    };
    void check;
  });
});
