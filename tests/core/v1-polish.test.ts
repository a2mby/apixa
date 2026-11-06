import { defineApi, HttpError, isHttpError } from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

describe("operation-level transforms are typed", () => {
  it("an operation's response keys override resource and root in TypeScript and at runtime", async () => {
    type Backend = { user_id: number };
    const api = defineApi<{ users: { entity: Backend } }>()({
      baseURL: "https://x.dev",
      transforms: { response: { keys: "camelCase" } },
      transport: createFakeTransport(() => ({ body: { user_id: 1 } })),
      resources: {
        users: {
          path: "/users",
          operations: {
            getById: { transforms: { response: { keys: "kebab-case" } } },
            raw: {
              kind: "read",
              method: "GET",
              path: "/raw",
              transforms: { response: { keys: "PascalCase" } },
            },
          },
        },
      },
    });
    expectTypeOf(api.users.getById).returns.resolves.toEqualTypeOf<{ "user-id": number }>();
    expectTypeOf(api.users.getAll).returns.resolves.toEqualTypeOf<{ userId: number }[]>();
    expect(await api.users.getById(1)).toEqual({ "user-id": 1 });
    expect(await api.users.raw()).toEqual({ UserId: 1 });
  });
});

describe("token refresh via error middleware replay()", () => {
  it("refreshes on 401 and replays the call once with fresh headers", async () => {
    let token = "old";
    const seen: string[] = [];
    const api = defineApi({
      baseURL: "https://x.dev",
      headers: () => ({ Authorization: `Bearer ${token}` }),
      transport: createFakeTransport((r) => {
        seen.push(r.headers.get("authorization")!);
        return token === "old" ? { status: 401 } : { body: [{ id: 1 }] };
      }),
      middleware: {
        onError: async (error, { replay }) => {
          if (isHttpError(error) && error.status === 401 && replay) {
            token = "new";
            return replay();
          }
          throw error;
        },
      },
      resources: { users: { path: "/users" } },
    });
    expect(await api.users.getAll()).toEqual([{ id: 1 }]);
    expect(seen).toEqual(["Bearer old", "Bearer new"]);
  });

  it("a replay cannot replay again (no loops)", async () => {
    let calls = 0;
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: createFakeTransport(() => (calls++, { status: 401 })),
      middleware: { onError: async (e, { replay }) => (replay ? replay() : Promise.reject(e)) },
      resources: { users: { path: "/users" } },
    });
    await expect(api.users.getAll()).rejects.toBeInstanceOf(HttpError);
    expect(calls).toBe(2);
  });
});

describe("unknown bodies are optional", () => {
  it("custom POST operations can be called without a body", async () => {
    const seen: unknown[] = [];
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: createFakeTransport((r) => (seen.push(r.body), { body: { ok: true } })),
      resources: {
        users: {
          path: "/users",
          operations: { archive: { kind: "write", method: "POST", path: "/:id/archive" } },
        },
      },
    });
    expectTypeOf(api.users.archive).parameter(1).toEqualTypeOf<unknown>();
    await api.users.archive(1);
    await api.users.archive(1, { reason: "x" });
    expect(seen).toEqual([undefined, JSON.stringify({ reason: "x" })]);
  });
});
