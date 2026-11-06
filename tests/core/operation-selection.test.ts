import { defineApi, type AllBuiltinOpName } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

const names: AllBuiltinOpName[] = [
  "getAll",
  "getById",
  "create",
  "update",
  "delete",
  "getBySlug",
  "patch",
  "upsert",
  "count",
  "search",
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
  it("exposes all 16 builtins by default, with no old bulk names", () => {
    const api = defineApi({
      ...base,
      resources: {
        users: { path: "/users" },
      },
    });
    expect(Object.keys(api.users).sort()).toEqual([...names].sort());
    expect(Object.keys(api.users)).not.toContain("bulkCreate");
    expect(Object.keys(api.users)).not.toContain("bulkDelete");
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
        users: { path: "/users", defaultOperations: false, operations: { [name]: true } },
      },
    } as never) as unknown as { users: Record<string, unknown> };
    expect(Object.keys(restored.users)).toEqual([name]);
  });

  it("resolves defaults, flags, groups, then individual entries", () => {
    const api = defineApi({
      ...base,
      resources: {
        users: {
          path: "/users",
          readOnly: true,
          operationGroups: { extended: false, many: true },
          operations: { create: true, createMany: { path: "/batch" }, deleteMany: false },
        },
      },
    });
    expect(Object.keys(api.users).sort()).toEqual(
      ["create", "createMany", "getAll", "getById", "getMany"].sort(),
    );
  });

  it("gives many precedence over broad, overlapping groups independent of property order", () => {
    const left = defineApi({
      ...base,
      resources: {
        users: { path: "/users", operationGroups: { many: true, read: false, extended: false } },
      },
    });
    const right = defineApi({
      ...base,
      resources: {
        users: { path: "/users", operationGroups: { extended: false, read: false, many: true } },
      },
    });
    expect(Object.keys(left.users).sort()).toEqual(Object.keys(right.users).sort());
    expect(left.users).toHaveProperty("getMany");
    expect(left.users).toHaveProperty("createMany");
    expect(left.users).toHaveProperty("deleteMany");
    expect(left.users).not.toHaveProperty("getAll");
  });

  it("supports writeOnly and defaultOperations false", () => {
    const write = defineApi({
      ...base,
      resources: {
        users: { path: "/users", writeOnly: true },
      },
    });
    expect(write.users).toHaveProperty("create");
    expect(write.users).not.toHaveProperty("getAll");
    expect(write.users).not.toHaveProperty("exists");
    const minimal = defineApi({
      ...base,
      resources: {
        users: { path: "/users", defaultOperations: false, operations: { getAll: true } },
      },
    });
    expect(Object.keys(minimal.users)).toEqual(["getAll"]);
  });

  it("rejects conflicting flags and custom true", () => {
    expect(() =>
      defineApi({
        ...base,
        resources: { users: { path: "/users", readOnly: true, writeOnly: true } },
      } as never),
    ).toThrow(/both readOnly and writeOnly/);
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
    await api.users.findFirst({ active: true });
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
    await api.users.exists("1", { orgId: "acme" });
    await api.users.findFirst(undefined, { orgId: "acme" });
    await api.users.getMany(["1"], { orgId: "acme" });
    await api.users.getBy("code", "A", { orgId: "acme" });
    expect(urls).toEqual([
      "https://api.example.com/orgs/acme/users/1",
      "https://api.example.com/orgs/acme/users",
      "https://api.example.com/orgs/acme/users?id=1",
      "https://api.example.com/orgs/acme/users/code/A",
    ]);
  });

  it("preserves the many-operation wire bodies and honors hasBody on a compatible method override", async () => {
    const seen: Array<{ method: string; url: string; body: unknown }> = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        seen.push({ method: request.method, url: request.url, body: request.body });
        return { body: [] };
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
