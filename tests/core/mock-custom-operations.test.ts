import { defineApi, MockError, type TransportRequest } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

/** Records whose ids look like operation paths: the dangerous case for URL-shaped routing. */
const records = () => [
  { id: "stats", name: "Stats" },
  { id: "purge", name: "Purge" },
  { id: "replace", name: "Replace" },
  { id: "update", name: "Update" },
  { id: "1", name: "One" },
];

function build() {
  const sent: TransportRequest[] = [];
  const api = defineApi({
    baseURL: "https://x.dev/v1",
    transport: createFakeTransport((request) => {
      sent.push(request);
      return { body: {} };
    }),
    resources: {
      users: {
        path: "/users",
        mock: records(),
        operations: {
          stats: { kind: "read", method: "GET", path: "/stats" },
          purge: { kind: "write", method: "DELETE", path: "/purge" },
          replace: { kind: "write", method: "PUT", path: "/replace" },
          update2: { kind: "write", method: "PATCH", path: "/update" },
          archive: { kind: "write", method: "POST", path: "/:id/archive" },
          getById: { path: "/lookup/:id" }, // a builtin override still has its own intent
          first: {
            kind: "read",
            run: (ctx, id: string) => ctx.request<{ id: string }>({ path: `/${id}` }),
          },
        },
      },
    },
  });
  return { api, sent };
}

async function unsupported(call: () => Promise<unknown>, operation: string) {
  const error = await call().then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(MockError);
  expect((error as MockError).code).toBe("MOCK_UNSUPPORTED");
  expect((error as MockError).message).toContain(`users.${operation}`);
}

describe("custom declarative operations on a mocked resource", () => {
  it("never run as a builtin because their path looks like an id", async () => {
    const { api } = build();
    await unsupported(() => api.users.stats(), "stats");
    await unsupported(() => api.users.purge(), "purge");
    await unsupported(() => api.users.replace({ name: "x" }), "replace");
    await unsupported(() => api.users.update2({ name: "x" }), "update2");
    await unsupported(() => api.users.archive(undefined, { params: { id: "1" } }), "archive");
  });

  it("leave the store untouched", async () => {
    const { api } = build();
    await api.users.purge().catch(() => undefined);
    await api.users.replace({ name: "x" }).catch(() => undefined);
    await api.users.update2({ name: "x" }).catch(() => undefined);
    expect((await api.users.getAll()).map((r) => r.id)).toEqual([
      "stats",
      "purge",
      "replace",
      "update",
      "1",
    ]);
    expect(await api.users.count()).toBe(5);
  });

  it("never reach the transport", async () => {
    const { api, sent } = build();
    await api.users.stats().catch(() => undefined);
    await api.users.archive(undefined, { params: { id: "1" } }).catch(() => undefined);
    await api.users.getAll();
    expect(sent).toEqual([]);
  });

  it("reach error middleware as an ordinary mock error", async () => {
    const seen: string[] = [];
    const api = defineApi({
      baseURL: "https://x.dev",
      middleware: [{ onError: (error) => void seen.push((error as MockError).code) }],
      resources: {
        users: {
          path: "/users",
          mock: records(),
          operations: { stats: { kind: "read", method: "GET", path: "/stats" } },
        },
      },
    });
    await api.users.stats().catch(() => undefined);
    expect(seen).toEqual(["MOCK_UNSUPPORTED"]);
  });
});

describe("what keeps working", () => {
  it("builtin overrides run by their own intent, whatever the path says", async () => {
    const { api } = build();
    expect(await api.users.getById("stats")).toEqual({ id: "stats", name: "Stats" });
    expect(await api.users.getById("1")).toEqual({ id: "1", name: "One" });
  });

  it("function operations route ctx.request through the conventions", async () => {
    const { api } = build();
    expect(await api.users.first("1")).toEqual({ id: "1", name: "One" });
    expect(await api.users.first("stats")).toEqual({ id: "stats", name: "Stats" });
  });

  it("a function operation can still not escape to another origin", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      resources: {
        users: {
          path: "/users",
          mock: records(),
          operations: {
            out: {
              kind: "read",
              run: (ctx) => ctx.request({ path: "https://other.example/x" }),
            },
          },
        },
      },
    });
    await expect(api.users.out()).rejects.toMatchObject({ code: "MOCK_UNSUPPORTED" });
  });
});
