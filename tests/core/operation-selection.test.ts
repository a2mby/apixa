import { defineApi, type AllBuiltinOpName } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

const names: AllBuiltinOpName[] = [
  "getAll",
  "getById",
  "create",
  "update",
  "delete",
  "patch",
  "count",
  "createMany",
  "deleteMany",
  "getMany",
  "exists",
  "findFirst",
  "getBy",
];
const base = {
  baseURL: "https://api.example.com",
  transport: createFakeTransport(() => ({ body: [] })),
};

describe("operation selection", () => {
  it("exposes all 13 builtins by default, with no old bulk or removed names", () => {
    const api = defineApi({
      ...base,
      resources: {
        users: { path: "/users" },
      },
    });
    expect(Object.keys(api.users).sort()).toEqual([...names].sort());
    expect(Object.keys(api.users)).not.toContain("bulkCreate");
    expect(Object.keys(api.users)).not.toContain("bulkDelete");
    expect(Object.keys(api.users)).not.toContain("getBySlug");
    expect(Object.keys(api.users)).not.toContain("upsert");
    expect(Object.keys(api.users)).not.toContain("search");
  });

  it.each(names)("disables and restores %s individually", (name) => {
    const disabled = defineApi({
      ...base,
      resources: { users: { path: "/users", operations: { [name]: false } } },
    } as never) as unknown as { users: Record<string, unknown> };
    expect(disabled.users).not.toHaveProperty(name);
    const restored = defineApi({
      ...base,
      resources: {
        users: { path: "/users", operations: { preset: [], [name]: true } },
      },
    } as never) as unknown as { users: Record<string, unknown> };
    expect(Object.keys(restored.users)).toEqual([name]);
  });

  it("applies named overrides after the selected operations", () => {
    const api = defineApi({
      ...base,
      resources: {
        users: {
          path: "/users",
          operations: {
            preset: ["getAll", "getById", "getMany"],
            create: true,
            createMany: { path: "/batch" },
            deleteMany: false,
          },
        },
      },
    });
    expect(Object.keys(api.users).sort()).toEqual(
      ["create", "createMany", "getAll", "getById", "getMany"].sort(),
    );
  });

  it("applies overrides independent of property order", () => {
    const left = defineApi({
      ...base,
      resources: {
        users: {
          path: "/users",
          operations: {
            preset: ["create", "update", "delete"],
            getMany: true,
            createMany: true,
            deleteMany: true,
          },
        },
      },
    });
    const right = defineApi({
      ...base,
      resources: {
        users: {
          path: "/users",
          operations: {
            deleteMany: true,
            createMany: true,
            getMany: true,
            preset: ["create", "update", "delete"],
          },
        },
      },
    });
    expect(Object.keys(left.users).sort()).toEqual(Object.keys(right.users).sort());
    expect(left.users).toHaveProperty("getMany");
    expect(left.users).toHaveProperty("createMany");
    expect(left.users).toHaveProperty("deleteMany");
    expect(left.users).not.toHaveProperty("getAll");
  });

  it("supports explicit write and minimal selections", () => {
    const write = defineApi({
      ...base,
      resources: {
        users: {
          path: "/users",
          operations: ["create", "update", "patch", "delete", "createMany", "deleteMany"],
        },
      },
    });
    expect(write.users).toHaveProperty("create");
    expect(write.users).not.toHaveProperty("getAll");
    expect(write.users).not.toHaveProperty("exists");
    const minimal = defineApi({
      ...base,
      resources: {
        users: { path: "/users", operations: ["getAll"] },
      },
    });
    expect(Object.keys(minimal.users)).toEqual(["getAll"]);
  });

  it("rejects removed flags and custom true", () => {
    expect(() =>
      defineApi({
        ...base,
        resources: { users: { path: "/users", readOnly: true, writeOnly: true } },
      } as never),
    ).toThrow(/unknown option "readOnly"/);
    expect(() =>
      defineApi({
        ...base,
        resources: { users: { path: "/users", operations: { archive: true } } },
      } as never),
    ).toThrow(/true cannot create custom operation "archive"/);
  });

  it("uses independent paths, methods, and query mapping for special builtins", async () => {
    const seen: Array<{ method: string; url: string; body: unknown }> = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        seen.push({ method: request.method, url: request.url, body: request.body });
        return { body: [{ id: "1" }] };
      }),
      resources: {
        users: {
          path: "/users",
          operations: {
            getAll: { path: "/all" },
            getById: { path: "/lookup/:id" },
            exists: { path: "/exists/:id" },
            findFirst: { path: "/first" },
            getMany: { path: "/batch", method: "GET" },
          },
        },
      },
    });
    await api.users.exists("1");
    await api.users.findFirst({ query: { active: true } });
    await api.users.getMany(["1", "2"]);
    expect(seen).toEqual([
      { method: "GET", url: "https://api.example.com/users/exists/1", body: undefined },
      { method: "GET", url: "https://api.example.com/users/first?active=true", body: undefined },
      { method: "GET", url: "https://api.example.com/users/batch?id=1&id=2", body: undefined },
    ]);
  });

  it("lets getBy use a declarative field/value template", async () => {
    const urls: string[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        urls.push(request.url);
        return { body: {} };
      }),
      resources: {
        users: { path: "/users", operations: { getBy: { path: "/lookup/:field/:value" } } },
      },
    });
    await api.users.getBy("email", "a@example.com");
    expect(urls).toEqual(["https://api.example.com/users/lookup/email/a%40example.com"]);
  });

  it("fills resource path parameters for independent builtins", async () => {
    const urls: string[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        urls.push(request.url);
        return { body: [{ id: "1" }] };
      }),
      resources: {
        users: { path: "/orgs/:orgId/users" },
      },
    });
    await api.users.exists("1", { params: { orgId: "acme" } });
    await api.users.findFirst({ params: { orgId: "acme" } });
    await api.users.getMany(["1"], { params: { orgId: "acme" } });
    await api.users.getBy("code", "A", { params: { orgId: "acme" } });
    expect(urls).toEqual([
      "https://api.example.com/orgs/acme/users/1",
      "https://api.example.com/orgs/acme/users",
      "https://api.example.com/orgs/acme/users?id=1",
      "https://api.example.com/orgs/acme/users?code=A",
    ]);
  });

  it("preserves the many-operation wire bodies and honors hasBody on a compatible method override", async () => {
    const seen: Array<{ method: string; url: string; body: unknown }> = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        seen.push({ method: request.method, url: request.url, body: request.body });
        return { body: request.url.endsWith("/count") ? 3 : [] };
      }),
      resources: {
        users: { path: "/users", operations: { count: { method: "HEAD", hasBody: false } } },
      },
    });
    await api.users.createMany([{ name: "Ada" }]);
    await api.users.deleteMany(["1", "2"]);
    await api.users.count();
    expect(seen).toEqual([
      { method: "POST", url: "https://api.example.com/users/bulk", body: '[{"name":"Ada"}]' },
      { method: "DELETE", url: "https://api.example.com/users/bulk", body: '["1","2"]' },
      { method: "HEAD", url: "https://api.example.com/users/count", body: undefined },
    ]);
  });
});
