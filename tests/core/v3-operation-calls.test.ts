import { defineApi } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

describe("v3 operation calls", () => {
  it("takes path and query parameters in one options object for a list", async () => {
    let url = "";
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        url = request.url;
        return { body: [] };
      }),
      resources: { users: { path: "/orgs/:orgId/users" } },
    });
    await api.users.getAll({ params: { orgId: "acme" }, query: { active: true } });
    expect(url).toBe("https://api.example.com/orgs/acme/users?active=true");
    if (false as boolean) {
      // @ts-expect-error a required path parameter belongs in options.params
      api.users.getAll();
      // @ts-expect-error the path parameter cannot be passed positionally
      api.users.getAll("acme");
    }
  });

  it("preserves body-bearing list overrides with body first and params in options", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    type State = { users: { operations: { getAll: { body: { active: boolean }; response: unknown[] } } } };
    const api = defineApi<State>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        requests.push({ url: request.url, body: request.body });
        return { body: [] };
      }),
      resources: {
        users: {
          path: "/orgs/:orgId/users",
          operations: { getAll: { method: "POST", hasBody: true } },
        },
      },
    });
    await api.users.getAll({ active: true }, { params: { orgId: "acme" } });
    expect(requests).toEqual([{ url: "https://api.example.com/orgs/acme/users", body: '{"active":true}' }]);
  });

  it("keeps identity and bodies first while path parameters stay in options", async () => {
    type User = { id: number; name: string };
    const requests: Array<{ method: string; url: string; body: unknown }> = [];
    const api = defineApi<{ users: { entity: User } }>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        requests.push({ method: request.method, url: request.url, body: request.body });
        return { body: { id: 7, name: "Ada" } };
      }),
      resources: { users: { path: "/orgs/:orgId/users" } },
    });
    await api.users.getById(7, { params: { orgId: "acme" } });
    await api.users.create({ name: "Ada" }, { params: { orgId: "acme" } });
    expect(requests).toEqual([
      { method: "GET", url: "https://api.example.com/orgs/acme/users/7", body: undefined },
      { method: "POST", url: "https://api.example.com/orgs/acme/users", body: '{"name":"Ada"}' },
    ]);
    if (false as boolean) {
      // @ts-expect-error path parameters belong in options, including for identity operations
      api.users.getById({ orgId: "acme", id: 7 });
      // @ts-expect-error the resource path requires orgId
      api.users.create({ name: "Ada" });
    }
  });

  it("takes findFirst filters from options.query", async () => {
    let url = "";
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        url = request.url;
        return { body: [{ id: 7, email: "a@b.c" }] };
      }),
      resources: { users: { path: "/orgs/:orgId/users" } },
    });
    await expect(api.users.findFirst({ params: { orgId: "acme" }, query: { email: "a@b.c" } }))
      .resolves.toEqual({ id: 7, email: "a@b.c" });
    expect(url).toBe("https://api.example.com/orgs/acme/users?email=a%40b.c");
  });

  it("uses options.params for special identity and collection operations", async () => {
    const urls: string[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        urls.push(request.url);
        return { body: [] };
      }),
      resources: { users: { path: "/orgs/:orgId/users" } },
    });
    await api.users.exists(7, { params: { orgId: "acme" } });
    await api.users.getMany([7, 8], { params: { orgId: "acme" } });
    expect(urls).toEqual([
      "https://api.example.com/orgs/acme/users/7",
      "https://api.example.com/orgs/acme/users?id=7&id=8",
    ]);
  });

  it("puts identity first and update bodies in the options object", async () => {
    type User = { id: number; name: string };
    const requests: Array<{ method: string; url: string; body: unknown }> = [];
    const api = defineApi<{ users: { entity: User } }>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        requests.push({ method: request.method, url: request.url, body: request.body });
        return { body: { id: 7, name: "Ada" } };
      }),
      resources: { users: { path: "/orgs/:orgId/users" } },
    });
    await api.users.update(7, { params: { orgId: "acme" }, body: { name: "Ada" } });
    await api.users.patch(7, { params: { orgId: "acme" }, body: { name: "Ada" } });
    expect(requests).toEqual([
      { method: "PUT", url: "https://api.example.com/orgs/acme/users/7", body: '{"name":"Ada"}' },
      { method: "PATCH", url: "https://api.example.com/orgs/acme/users/7", body: '{"name":"Ada"}' },
    ]);
  });

  it("uses body and options consistently for custom HTTP operations", async () => {
    type State = {
      users: {
        operations: {
          archive: { body: { reason: string }; response: { ok: boolean } };
          stats: { response: number };
        };
      };
    };
    const requests: Array<{ method: string; url: string; body: unknown }> = [];
    const api = defineApi<State>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        requests.push({ method: request.method, url: request.url, body: request.body });
        return { body: request.method === "GET" ? 3 : { ok: true } };
      }),
      resources: {
        users: {
          path: "/orgs/:orgId/users",
          operations: {
            archive: { method: "POST", path: "/:id/archive" },
            stats: { method: "GET", path: "/stats/:range" },
          },
        },
      },
    });
    await api.users.archive({ reason: "duplicate" }, { params: { orgId: "acme", id: 7 } });
    await api.users.stats({ params: { orgId: "acme", range: "week" }, query: { active: true } });
    expect(requests).toEqual([
      { method: "POST", url: "https://api.example.com/orgs/acme/users/7/archive", body: '{"reason":"duplicate"}' },
      { method: "GET", url: "https://api.example.com/orgs/acme/users/stats/week?active=true", body: undefined },
    ]);
  });

  it("passes resource path params in options.params for count, createMany, and deleteMany", async () => {
    type User = { id: number; name: string };
    const requests: Array<{ method: string; url: string; body: unknown }> = [];
    const api = defineApi<{ users: { entity: User } }>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        requests.push({ method: request.method, url: request.url, body: request.body });
        if (request.url.includes("/count")) return { body: 4 };
        if (request.method === "POST") return { body: [{ id: 1, name: "Ada" }] };
        return { body: undefined };
      }),
      resources: { users: { path: "/orgs/:orgId/users" } },
    });
    await expect(
      api.users.count({ params: { orgId: "acme" }, query: { active: true } }),
    ).resolves.toBe(4);
    await expect(
      api.users.createMany([{ name: "Ada" }], { params: { orgId: "acme" } }),
    ).resolves.toEqual([{ id: 1, name: "Ada" }]);
    await api.users.deleteMany([1, 2], { params: { orgId: "acme" } });
    expect(requests).toEqual([
      { method: "GET", url: "https://api.example.com/orgs/acme/users/count?active=true", body: undefined },
      { method: "POST", url: "https://api.example.com/orgs/acme/users/bulk", body: '[{"name":"Ada"}]' },
      { method: "DELETE", url: "https://api.example.com/orgs/acme/users/bulk", body: "[1,2]" },
    ]);
  });
});
