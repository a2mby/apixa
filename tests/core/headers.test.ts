import { defineApi, type TransportRequest } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

function recorder() {
  const seen: TransportRequest[] = [];
  return { seen, transport: createFakeTransport((r) => (seen.push(r), { body: [] })) };
}

describe("hierarchical headers", () => {
  it("merges root < resource < operation < request, case-insensitively", async () => {
    const { seen, transport } = recorder();
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport,
      headers: { "X-Level": "root", "X-Root": "1", authorization: "root" },
      resources: {
        users: {
          path: "/users",
          headers: { "x-level": "resource", "X-Resource": "1" },
          operations: { getAll: { headers: { "X-LEVEL": "operation", Authorization: "op" } } },
        },
      },
    });
    await api.users.getAll({ headers: { "x-level": "request" } });
    const h = seen[0]!.headers;
    expect(h.get("x-level")).toBe("request");
    expect(h.get("x-root")).toBe("1");
    expect(h.get("x-resource")).toBe("1");
    expect(h.get("authorization")).toBe("op");
  });

  it("an undefined value removes an inherited header", async () => {
    const { seen, transport } = recorder();
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport,
      headers: { Authorization: "Bearer x" },
      resources: { public: { path: "/public", headers: { Authorization: undefined } } },
    });
    await api.public.getAll();
    expect(seen[0]!.headers.has("authorization")).toBe(false);
  });

  it("evaluates sync and async providers on every logical request", async () => {
    const { seen, transport } = recorder();
    let token = 0;
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport,
      headers: async () => ({ Authorization: `Bearer ${++token}` }),
      resources: { users: { path: "/users", headers: () => ({ "X-Sync": "yes" }) } },
    });
    await api.users.getAll();
    await api.users.getAll();
    expect(seen.map((r) => r.headers.get("authorization"))).toEqual(["Bearer 1", "Bearer 2"]);
    expect(seen[1]!.headers.get("x-sync")).toBe("yes");
  });

  it("evaluates providers once per logical call, not once per retry attempt", async () => {
    let calls = 0;
    let attempts = 0;
    const api = defineApi({
      baseURL: "https://api.example.com",
      retry: { retries: 2, baseDelayMs: 0, jitter: false },
      headers: () => ({ "X-Call": String(++calls) }),
      transport: createFakeTransport(() => (++attempts < 3 ? { status: 503 } : { body: [] })),
      resources: { users: { path: "/users" } },
    });
    await api.users.getAll();
    expect(attempts).toBe(3);
    expect(calls).toBe(1);
  });

  it("classifies provider failures as HEADERS errors and sends nothing", async () => {
    const { seen, transport } = recorder();
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport,
      headers: async () => {
        throw new Error("token store offline");
      },
      resources: { users: { path: "/users" } },
    });
    await expect(api.users.getAll()).rejects.toMatchObject({
      code: "HEADERS",
      message: expect.stringMatching(/token store offline/),
    });
    expect(seen).toEqual([]);
  });

  it("never leaks header state between calls or clients", async () => {
    const { seen, transport } = recorder();
    const shared = { "X-Shared": "1" };
    const a = defineApi({
      baseURL: "https://a.example.com",
      transport,
      headers: shared,
      middleware: [{ onRequest: (r) => (r.headers.set("X-Mutated", "yes"), r) }],
      resources: { users: { path: "/users" } },
    });
    const b = defineApi({
      baseURL: "https://b.example.com",
      transport,
      headers: shared,
      resources: { users: { path: "/users" } },
    });
    await a.users.getAll();
    await b.users.getAll();
    await a.users.getAll({ headers: { "X-Once": "1" } });
    await a.users.getAll();
    expect(seen[1]!.headers.has("x-mutated")).toBe(false);
    expect(seen[3]!.headers.has("x-once")).toBe(false);
    expect(shared).toEqual({ "X-Shared": "1" });
  });
});
