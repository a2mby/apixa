import { ConfigError, defineApi, SecurityError, type TransportRequest } from "@apixa/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

function recorder() {
  const seen: TransportRequest[] = [];
  const transport = createFakeTransport((request) => {
    seen.push(request);
    const pathname = new URL(request.url).pathname;
    if (pathname.endsWith("/count")) return { body: 1 };
    if (pathname.endsWith("/users")) return { body: [] };
    return { body: { id: 1 } };
  });
  return { seen, transport };
}

describe("URL construction", () => {
  it.each([
    ["https://api.example.com", "https://api.example.com/users/1"],
    ["https://api.example.com/", "https://api.example.com/users/1"],
    ["https://api.example.com/v1", "https://api.example.com/v1/users/1"],
    ["https://api.example.com/api/v1/", "https://api.example.com/api/v1/users/1"],
    ["http://localhost:3000", "http://localhost:3000/users/1"],
    ["http://backend:8080", "http://backend:8080/users/1"],
    ["http://host.docker.internal:3000/api", "http://host.docker.internal:3000/api/users/1"],
  ])("joins %s without dropping or duplicating segments", async (baseURL, expected) => {
    const { seen, transport } = recorder();
    const api = defineApi({ baseURL, transport, resources: { users: { path: "/users/" } } });
    await api.users.getById(1);
    expect(seen[0]!.url).toBe(expected);
  });

  it("encodes path params and serializes query parameters", async () => {
    const { seen, transport } = recorder();
    const api = defineApi({
      baseURL: "https://api.example.com/v1",
      transport,
      queryArrayFormat: "brackets",
      resources: { users: { path: "/users" } },
    });
    await api.users.getById("a/b c", { query: { tags: ["x", "y"], q: "hi there" } });
    expect(seen[0]!.url).toBe(
      "https://api.example.com/v1/users/a%2Fb%20c?tags%5B%5D=x&tags%5B%5D=y&q=hi%20there",
    );
  });

  it("rejects invalid base URLs at construction", () => {
    for (const baseURL of [
      "",
      "api.example.com",
      "ftp://x.dev",
      "//cdn.example.com",
      "https://x.dev?a=1",
    ]) {
      expect(() => defineApi({ baseURL, resources: {} }), baseURL).toThrow(ConfigError);
    }
  });
});

describe("browser-relative baseURL", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("errors clearly in Node (no origin is guessed) — only when a live request is made", async () => {
    const { seen, transport } = recorder();
    const api = defineApi({ baseURL: "/api", transport, resources: { users: { path: "/users" } } });
    await expect(api.users.getAll()).rejects.toThrow(/relative.*no browser origin/);
    expect(seen).toEqual([]);
  });

  it("resolves against location.origin in a browser", async () => {
    vi.stubGlobal("location", { origin: "https://app.example.com" });
    const { seen, transport } = recorder();
    const api = defineApi({ baseURL: "/api", transport, resources: { users: { path: "/users" } } });
    await api.users.getById(3);
    expect(seen[0]!.url).toBe("https://app.example.com/api/users/3");
  });
});

describe("origin protection — credentials never reach another origin", () => {
  const secret = { Authorization: "Bearer secret" };

  it("allows same-origin absolute operation URLs", async () => {
    const { seen, transport } = recorder();
    const api = defineApi({
      baseURL: "https://api.example.com/v1",
      headers: secret,
      transport,
      resources: {
        users: {
          path: "/users",
          operations: { count: { path: "https://api.example.com/stats/count" } },
        },
      },
    });
    await api.users.count();
    expect(seen[0]!.url).toBe("https://api.example.com/stats/count");
  });

  it("blocks cross-origin operation paths, dynamic getBy paths, and ctx.request URLs", async () => {
    const { seen, transport } = recorder();
    const api = defineApi({
      baseURL: "https://api.example.com",
      headers: secret,
      transport,
      resources: {
        users: {
          path: "/users",
          operations: {
            count: { path: "https://evil.example/count" },
            leak: {
              kind: "read",
              run: (ctx) => ctx.request({ path: "https://evil.example/collect" }),
            },
          },
        },
      },
    });
    await expect(api.users.count()).rejects.toBeInstanceOf(SecurityError);
    await api.users.getBy("https://untrusted.example/collect", "123");
    expect(seen.map((r) => r.url)).toEqual([
      "https://api.example.com/users?https%3A%2F%2Funtrusted.example%2Fcollect=123",
    ]);
    await expect(api.users.leak()).rejects.toMatchObject({ code: "SECURITY" });
    expect(seen).toHaveLength(1);
  });

  it("checks the final URL after request middleware rewrites it", async () => {
    const { seen, transport } = recorder();
    const api = defineApi({
      baseURL: "https://api.example.com",
      headers: secret,
      transport,
      middleware: { onRequest: [(request) => ({ ...request, url: "https://evil.example/steal" })] },
      resources: { users: { path: "/users" } },
    });
    await expect(api.users.getAll()).rejects.toBeInstanceOf(SecurityError);
    expect(seen).toEqual([]);
  });

  it("allows middleware to rewrite within the same origin", async () => {
    const { seen, transport } = recorder();
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport,
      middleware: {
        onRequest: [(request) => ({ ...request, url: request.url.replace("/users", "/v2/users") })],
      },
      resources: { users: { path: "/users" } },
    });
    await api.users.getAll();
    expect(seen[0]!.url).toBe("https://api.example.com/v2/users");
  });

  it("does not treat localhost or Docker hosts as trusted for other origins", async () => {
    const { seen, transport } = recorder();
    const api = defineApi({
      baseURL: "http://localhost:3000",
      headers: secret,
      transport,
      resources: {
        users: { path: "/users", operations: { count: { path: "http://backend:8080/count" } } },
      },
    });
    await expect(api.users.count()).rejects.toBeInstanceOf(SecurityError);
    expect(seen).toEqual([]);
  });
});
