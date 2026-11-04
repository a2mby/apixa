import { defineApi } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

describe("configuration merge", () => {
  it("inherits resource-level headers on built-in operations", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      headers: { Accept: "application/json", "X-Api": "root" },
      transport: createFakeTransport((request) => {
        expect(request.headers.get("accept")).toBe("application/json");
        expect(request.headers.get("x-api")).toBe("root");
        expect(request.headers.get("x-client")).toBe("dashboard");
        return { body: [] };
      }),
      resources: {
        users: {
          path: "/users",
          headers: { "X-Client": "dashboard" },
        },
      },
    });

    await api.users.getAll();
  });

  it("merges operation headers over resource and API headers by key", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      headers: { "X-Level": "api", Accept: "application/json" },
      transport: createFakeTransport((request) => {
        expect(request.headers.get("x-level")).toBe("operation");
        expect(request.headers.get("x-client")).toBe("dashboard");
        expect(request.headers.get("accept")).toBe("application/json");
        return { body: [] };
      }),
      resources: {
        users: {
          path: "/users",
          headers: { "X-Level": "resource", "X-Client": "dashboard" },
          operations: {
            getAll: {
              headers: { "X-Level": "operation" },
            },
          },
        },
      },
    });

    await api.users.getAll();
  });

  it("lets per-call headers override operation headers", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        expect(request.headers.get("x-level")).toBe("call");
        return { body: [] };
      }),
      resources: {
        users: {
          path: "/users",
          operations: {
            getAll: {
              headers: { "X-Level": "operation" },
            },
          },
        },
      },
    });

    await api.users.getAll({ headers: { "X-Level": "call" } });
  });
});
