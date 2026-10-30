import {
  defineApi,
  HttpError,
  isHttpError,
  isTimeoutError,
  TimeoutError,
  type Middleware,
} from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
// expectTypeOf used for list/query + full response
import { createFakeTransport } from "../helpers/fake-transport.js";

describe("v0.7.0 thin core", () => {
  it("concatenates resource and op path params at the call site", async () => {
    type Api = {
      users: {
        path: "/orgs/:orgId/users";
        entity: { id: string; name: string };
      };
    };

    const seen: string[] = [];
    const api = defineApi<Api>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        seen.push(request.url);
        return { body: { id: "1", name: "Ada" } };
      }),
      users: { path: "/orgs/:orgId/users" },
    });

    await api.users.getById({ orgId: "acme", id: "1" });
    expect(seen[0]).toBe("https://api.example.com/orgs/acme/users/1");
  });

  it("encodes query arrays with queryArrayFormat", async () => {
    const seen: string[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      queryArrayFormat: "brackets",
      transport: createFakeTransport((request) => {
        seen.push(request.url);
        return { body: [] };
      }),
      users: { path: "/users" },
    });

    await api.users.getAll({ query: { tag: ["a", "b"] } });
    expect(seen[0]).toContain("tag[]=a");
    expect(seen[0]).toContain("tag[]=b");
  });

  it("passes FormData bodies through without JSON encoding", async () => {
    let seenBody: BodyInit | null | undefined;
    const form = new FormData();
    form.append("name", "Ada");

    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        seenBody = request.body;
        return { status: 201, body: { id: "1" } };
      }),
      users: { path: "/users" },
    });

    await api.users.create(form as never);
    expect(seenBody).toBe(form);
  });

  it("returns ApiResponse when full: true", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: [{ id: "1" }] })),
      users: { path: "/users" },
    });

    const res = await api.users.getAll({ full: true as const });
    expectTypeOf(res).toHaveProperty("data");
    expect(res).toMatchObject({ status: 200, data: [{ id: "1" }] });
    expect(res.headers).toBeInstanceOf(Headers);
  });

  it("honors shouldRetry override and onRetry hook", async () => {
    let attempts = 0;
    let onRetryCalls = 0;

    const api = defineApi({
      baseURL: "https://api.example.com",
      retry: {
        retries: 2,
        baseDelayMs: 1,
        jitter: false,
        shouldRetry: ({ attempt }) => attempt < 1,
        onRetry: () => {
          onRetryCalls += 1;
        },
      },
      transport: createFakeTransport(() => {
        attempts += 1;
        return { status: 503, body: { detail: "down" } };
      }),
      users: { path: "/users" },
    });

    await expect(api.users.getAll()).rejects.toBeInstanceOf(HttpError);
    expect(attempts).toBe(2);
    expect(onRetryCalls).toBe(1);
  });

  it("exports isHttpError and isTimeoutError", () => {
    expect(isHttpError(new HttpError("x", { status: 500 }))).toBe(true);
    expect(isTimeoutError(new TimeoutError())).toBe(true);
    expect(isHttpError(new TimeoutError())).toBe(false);
  });

  it("types getAll list/query from ResourceState", () => {
    type User = { id: string; name: string };
    type Page = { data: User[]; total: number };
    type Api = {
      users: {
        path: "/users";
        entity: User;
        list: Page;
        query: { active?: boolean };
      };
    };

    const api = defineApi<Api>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: { data: [], total: 0 } })),
      users: { path: "/users" },
    });

    expectTypeOf(api.users.getAll()).resolves.toEqualTypeOf<Page>();
    void api;
  });
});
