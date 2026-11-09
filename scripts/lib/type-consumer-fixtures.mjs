// Source text for the npm-installed type consumers (see scripts/verify-type-consumers.mjs).

const HELPERS = `
type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends true> = T;
type NotAny<T> = IsAny<T> extends false ? true : false;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
/** Names of members whose type is \`any\`: the whole result must have none. */
type AnyKeys<T> = { [K in keyof T]-?: IsAny<T[K]> extends true ? K : never }[keyof T];
type NoAnyMembers<T> = [AnyKeys<T>] extends [never] ? true : false;
`;

const API = `
type User = { id: string; name: string; email: string };
const api = defineApi<{ users: { entity: User } }>()({
  baseURL: "https://example.test",
  resources: {
    users: {
      path: "/users",
      operations: {
        stats: { kind: "read", method: "GET", path: "/stats" },
        archive: {
          kind: "write",
          run: async (ctx, id: string) => ctx.request<User>({ method: "POST", path: \`/\${id}/archive\` }),
        },
      },
    },
  },
});
`;

/** Binary downloads: shared by every fixture (operation-level and per-call `responseType`). */
const DOWNLOAD_API = `
type Doc = { id: string; name: string };
const files = defineApi<{ docs: { path: "/docs"; entity: Doc } }>()({
  baseURL: "https://example.test",
  resources: {
    docs: {
      path: "/docs",
      operations: {
        download: { kind: "read", method: "GET", path: "/:id/file", responseType: "blob" },
        raw: { kind: "read", method: "GET", path: "/:id/raw", responseType: "arrayBuffer" },
        note: { kind: "read", method: "GET", path: "/:id/note", responseType: "text" },
        report: { kind: "write", method: "POST", path: "/report", responseType: "blob" },
        viaCtx: {
          kind: "read",
          run: (ctx, id: string) => ctx.request({ path: \`/\${id}/file\`, responseType: "blob" }),
        },
        typedCtx: { kind: "read", run: (ctx) => ctx.request<Doc[]>({ path: "/" }) },
      },
    },
  },
});
`;

const STORAGE_API = `
const fixture = mockFileFixture("bytes", { name: "seed.txt", type: "text/plain" });
const seeded = defineCore({ baseURL: "https://example.test", resources: { docs: { path: "/docs", fileFields: ["file"], mock: {
  data: [{ id: 1, file: mockFixtureRef("seed") }], fixtures: { seed: fixture }, storage: { disk: "test", directory: "docs", naming: "unique" },
} } } });
async function storageTypes() {
  const row = await seeded.docs.getById(1);
  type _ref = Assert<Equal<typeof row.file, string>>;
  const file = mockFiles(seeded).get(row.file);
  type _meta = Assert<Equal<NonNullable<typeof file>["meta"]["disk"], string | undefined>>;
  await seeded.docs.patch(1, { file: new Blob(["next"]) });
  const listed = mockFiles(seeded).list({ disk: "test", path: "docs" });
  type _list = Assert<NotAny<typeof listed[number]>>;
}
void storageTypes;
`;

/** Core only: no React, no TanStack anywhere in the project. */
export const CORE_ONLY = `import { defineApi, detectTransferSupport, parseContentDisposition, type ApiError, type TransferEvent, type TransferSupport, type FileViolation, type FileViolationCode, ValidationError } from "apixa";
import { defineApi as defineCore, mockFileFixture, mockFixtureRef, mockFiles } from "apixa/core";
import { defineMockApi } from "apixa/mocking";
${HELPERS}${API}${DOWNLOAD_API}${STORAGE_API}
const core = defineCore({ baseURL: "https://example.test", resources: { u: { path: "/u" } } });
void core;
void defineMockApi;
export async function main() {
  const list = await api.users.getAll();
  type _list = Assert<Equal<typeof list, User[]>>;
  const one = await api.users.getById("1");
  type _one = Assert<Equal<typeof one, User>>;
  const archived = await api.users.archive("1");
  type _archived = Assert<Equal<typeof archived, User>>;
  type _err = Assert<NotAny<ApiError>>;

  const blob = await files.docs.download("1");
  type _d1 = Assert<Equal<typeof blob, Blob>>;
  const buffer = await files.docs.raw("1");
  type _d2 = Assert<Equal<typeof buffer, ArrayBuffer>>;
  const note = await files.docs.note("1");
  type _d3 = Assert<Equal<typeof note, string>>;
  const full = await files.docs.download("1", { full: true });
  type _d4 = Assert<Equal<(typeof full)["data"], Blob>>;
  type _d5 = Assert<Equal<(typeof full)["status"], number>>;
  type _d6 = Assert<Equal<(typeof full)["headers"], Headers>>;
  const posted = await files.docs.report({ format: "pdf" });
  type _d7 = Assert<Equal<typeof posted, Blob>>;
  const perCall = await files.docs.getById("1", { responseType: "blob" });
  type _d8 = Assert<Equal<typeof perCall, Blob>>;
  const viaCtx = await files.docs.viaCtx("1");
  type _d9 = Assert<Equal<typeof viaCtx, Blob>>;
  const typedCtx = await files.docs.typedCtx();
  type _d10 = Assert<Equal<typeof typedCtx, Doc[]>>;
  type _d11 = Assert<NotAny<typeof blob>>;
  const disposition = parseContentDisposition(full.headers);
  type _d12 = Assert<Equal<typeof disposition.filename, string | undefined>>;

  // v1.3.0: typed transfer events (inline callbacks are contextually typed from packed declarations).
  const watched = await files.docs.download("1", {
    onTransfer: (event) => {
      type _t1 = Assert<Equal<typeof event, TransferEvent>>;
      type _t2 = Assert<NotAny<typeof event>>;
      if (event.phase === "progress") {
        type _t3 = Assert<Equal<typeof event.loaded, number>>;
        type _t4 = Assert<Equal<typeof event.total, number | undefined>>;
      }
    },
  });
  type _t5 = Assert<Equal<typeof watched, Blob>>;
  const watchedFull = await files.docs.download("1", { full: true, onTransfer: () => {} });
  type _t6 = Assert<Equal<(typeof watchedFull)["data"], Blob>>;
  const watchedEntity = await api.users.getById("1", { onTransfer: () => {} });
  type _t7 = Assert<Equal<typeof watchedEntity, User>>;
  const support = detectTransferSupport();
  type _t8 = Assert<Equal<typeof support, TransferSupport>>;

  // v1.4.0: file rules, limits and typed violations from packed declarations.
  const rules = defineApi<{ pets: { path: "/pets"; entity: { id: string; photo?: string | null } } }>()({
    baseURL: "https://example.test",
    resources: {
      pets: {
        path: "/pets",
        fileFields: { photo: { maxSize: 5, accept: ["image/*", ".heic"], unknownType: "allow", filename: "strict" } },
        fileLimits: { maxTotalSize: 10, maxFiles: 2 },
        operations: { export: { kind: "read", method: "GET", path: "/export", responseType: "blob", maxResponseSize: 100 } },
      },
    },
  });
  const exported = await rules.pets.export({ maxResponseSize: 5 });
  type _v1 = Assert<Equal<typeof exported, Blob>>;
  try {
    await rules.pets.create({ photo: new File([], "a.png") });
  } catch (error) {
    if (error instanceof ValidationError) {
      type _v2 = Assert<Equal<typeof error.violations, readonly FileViolation[]>>;
      type _v3 = Assert<Equal<FileViolation["code"], FileViolationCode>>;
    }
  }
}
`;

/** Fully typed React usage: every hook result checked as a whole and member by member. */
export const REACT_TYPED = `import { defineApi } from "apixa/core";
import { useResource, useResourceMutation, useResourceQuery } from "apixa/react";
${HELPERS}${API}${DOWNLOAD_API}
export function App() {
  const q = useResourceQuery(api.users, { queryKey: ["users"] });
  type Q = typeof q;
  type _q1 = Assert<NotAny<Q>>;
  type _q2 = Assert<NoAnyMembers<Q>>;
  type _q3 = Assert<Equal<Q["data"], User[] | undefined>>;
  type _q4 = Assert<Equal<Q["query"]["data"], User[] | undefined>>;
  type _q5a = Assert<NotAny<Q["refetch"]>>;
  type _q5b = Assert<NotAny<Q["controller"]>>;
  type _q5c = Assert<NotAny<Q["cache"]>>;
  type _q5d = Assert<NotAny<Q["invalidate"]>>;

  const selected = useResourceQuery(api.users, { queryKey: ["names"], select: (rows) => rows.map((u) => u.name) });
  type _s1 = Assert<NotAny<typeof selected>>;
  type _s2 = Assert<Equal<(typeof selected)["data"], string[] | undefined>>;
  useResourceQuery(api.users, {
    queryKey: ["count"],
    select: (rows) => {
      type _rows = Assert<Equal<typeof rows, User[]>>;
      return rows.length;
    },
  });
  const watched = useResourceQuery(files.docs, {
    queryKey: ["file"],
    operation: "download",
    args: [
      "1",
      {
        onTransfer: (event) => {
          type _tx1 = Assert<NotAny<typeof event>>;
          type _tx2 = Assert<Equal<typeof event.direction, "upload" | "download">>;
        },
      },
    ],
  });
  type _tx3 = Assert<NotAny<typeof watched>>;
  type _tx4 = Assert<Equal<(typeof watched)["data"], Blob | undefined>>;
  const one = useResourceQuery(api.users, { queryKey: ["one"], operation: "getById", args: ["1"] });
  type _o1 = Assert<NotAny<typeof one>>;
  type _o2 = Assert<Equal<(typeof one)["data"], User | undefined>>;

  const r = useResource(api.users, { queryKey: ["users"] });
  type R = typeof r;
  type _r1 = Assert<NotAny<R>>;
  type _r2 = Assert<NoAnyMembers<R>>;
  type _r3 = Assert<Equal<R["data"], User[] | undefined>>;
  type _r5 = Assert<Equal<Parameters<R["archive"]>[0], string>>;
  type _r6 = Assert<Equal<ReturnType<R["archive"]>, Promise<User>>>;
  type _r7 = Assert<Equal<Parameters<R["getById"]>[0], string>>;
  type _r8 = Assert<Equal<Parameters<R["create"]>[0]["name"], string>>;
  type _r9a = Assert<NotAny<R["states"]>>;
  type _r9b = Assert<NotAny<R["states"]["create"]>>;
  type _r9c = Assert<NotAny<R["states"]["archive"]>>;
  type _r10 = Assert<Equal<R["states"]["create"]["isPending"], boolean>>;
  const rs = useResource(api.users, { queryKey: ["users"], query: { select: (rows) => rows.map((u) => u.id) } });
  type _rs = Assert<Equal<(typeof rs)["data"], string[] | undefined>>;

  const w = useResourceMutation(api.users, { queryKey: ["users"] });
  type W = typeof w;
  type _w1 = Assert<NotAny<W>>;
  type _w2 = Assert<NoAnyMembers<W>>;
  type _w3 = Assert<Equal<Parameters<W["archive"]>[0], string>>;
  type _w4 = Assert<Equal<ReturnType<W["archive"]>, Promise<User>>>;
  type _w5a = Assert<NotAny<W["states"]>>;
  type _w5b = Assert<NotAny<W["states"]["create"]>>;
  type _w6 = Assert<Equal<W["states"]["create"]["isPending"], boolean>>;
  const custom = useResourceMutation(api.users, {
    queryKey: ["users"],
    mutations: { ping: { mutationFn: async (n: number) => n * 2 } },
  });
  type _w7 = Assert<Equal<ReturnType<(typeof custom)["ping"]>, Promise<number>>>;

  const dq = useResourceQuery(files.docs, { queryKey: ["file"], operation: "download", args: ["1"] });
  type DQ = typeof dq;
  type _dq1 = Assert<NotAny<DQ>>;
  type _dq2 = Assert<NoAnyMembers<DQ>>;
  type _dq3 = Assert<Equal<DQ["data"], Blob | undefined>>;
  const dsel = useResourceQuery(files.docs, {
    queryKey: ["size"],
    operation: "download",
    args: ["1"],
    select: (blob) => {
      type _b = Assert<Equal<typeof blob, Blob>>;
      return blob.size;
    },
  });
  type _dq4 = Assert<Equal<(typeof dsel)["data"], number | undefined>>;
  const dr = useResource(files.docs, { queryKey: ["files"], query: { operation: "download", args: ["1"] } });
  type DR = typeof dr;
  type _dr1 = Assert<NotAny<DR>>;
  type _dr2 = Assert<NoAnyMembers<DR>>;
  type _dr3 = Assert<Equal<DR["data"], Blob | undefined>>;
  type _dr4 = Assert<Equal<ReturnType<DR["download"]>, Promise<Blob>>>;
  type _dr5 = Assert<Equal<ReturnType<DR["raw"]>, Promise<ArrayBuffer>>>;
  type _dr6 = Assert<Equal<ReturnType<DR["report"]>, Promise<Blob>>>;
  const dw = useResourceMutation(files.docs, { queryKey: ["files"] });
  type DW = typeof dw;
  type _dw1 = Assert<NotAny<DW>>;
  type _dw2 = Assert<NoAnyMembers<DW>>;
  type _dw3 = Assert<Equal<ReturnType<DW["report"]>, Promise<Blob>>>;

  // @ts-expect-error unknown member
  r.nope;
  // @ts-expect-error wrong argument type
  w.archive(1);
  return null;
}
`;
