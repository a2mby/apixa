import { defineApi, type AllBuiltinOpName, type TransportRequest } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type Case = {
  name: AllBuiltinOpName;
  call: (users: Record<string, (...args: unknown[]) => Promise<unknown>>) => Promise<unknown>;
  /** Expected HTTP wire request (method + URL after the base). */
  http: string;
  /** Expected mock result (against the 3 seed rows below). */
  mock: (result: unknown) => void;
};

const seed = () => [
  { id: 1, name: "Ali", slug: "ali" },
  { id: 2, name: "Omar", slug: "omar" },
  { id: 3, name: "Sara", slug: "sara" },
];

const cases: Case[] = [
  {
    name: "getAll",
    call: (u) => u.getAll!(),
    http: "GET /users",
    mock: (r) => expect(r).toHaveLength(3),
  },
  {
    name: "getById",
    call: (u) => u.getById!(2),
    http: "GET /users/2",
    mock: (r) => expect(r).toMatchObject({ id: 2 }),
  },
  {
    name: "getMany",
    call: (u) => u.getMany!([3, 1]),
    http: "GET /users?id=3&id=1",
    mock: (r) => expect((r as { id: number }[]).map((x) => x.id)).toEqual([3, 1]),
  },
  {
    name: "getBy",
    call: (u) => u.getBy!("name", "Omar"),
    http: "GET /users?name=Omar",
    mock: (r) => expect(r).toMatchObject({ id: 2 }),
  },
  {
    name: "findFirst",
    call: (u) => u.findFirst!({ query: { name: "Sara" } }),
    http: "GET /users?name=Sara",
    mock: (r) => expect(r).toMatchObject({ id: 3 }),
  },
  {
    name: "exists",
    call: (u) => u.exists!(1),
    http: "GET /users/1",
    mock: (r) => expect(r).toBe(true),
  },
  {
    name: "count",
    call: (u) => u.count!(),
    http: "GET /users/count",
    mock: (r) => expect(r).toBe(3),
  },
  {
    name: "create",
    call: (u) => u.create!({ name: "New" }),
    http: "POST /users",
    mock: (r) => expect(r).toMatchObject({ id: 4 }),
  },
  {
    name: "update",
    call: (u) => u.update!(1, { body: { name: "X", slug: "x" } }),
    http: "PUT /users/1",
    mock: (r) => expect(r).toMatchObject({ name: "X" }),
  },
  {
    name: "patch",
    call: (u) => u.patch!(1, { body: { name: "P" } }),
    http: "PATCH /users/1",
    mock: (r) => expect(r).toMatchObject({ name: "P", slug: "ali" }),
  },
  {
    name: "delete",
    call: (u) => u.delete!(1),
    http: "DELETE /users/1",
    mock: (r) => expect(r).toBeNull(),
  },
  {
    name: "createMany",
    call: (u) => u.createMany!([{ name: "A" }, { name: "B" }]),
    http: "POST /users/bulk",
    mock: (r) => expect((r as { id: number }[]).map((x) => x.id)).toEqual([4, 5]),
  },
  {
    name: "deleteMany",
    call: (u) => u.deleteMany!([1, 2]),
    http: "DELETE /users/bulk",
    mock: (r) => expect(r).toBeNull(),
  },
];

const names = cases.map((c) => c.name);
/** A different builtin to disable / override for each target. */
const other = (name: AllBuiltinOpName) => names[(names.indexOf(name) + 1) % names.length]!;
/** Prove specific historical couplings are gone too. */
const coupled: Partial<Record<AllBuiltinOpName, AllBuiltinOpName[]>> = {
  getMany: ["getAll", "getById"],
  exists: ["getById"],
  findFirst: ["getAll"],
  getBy: ["getById", "getAll"],
  createMany: ["create"],
  deleteMany: ["delete"],
};

function throwing(): () => Promise<never> {
  return async () => {
    throw new Error("an unrelated operation was called");
  };
}

function overridesFor(name: AllBuiltinOpName) {
  const targets = [other(name), ...(coupled[name] ?? [])].filter((n) => n !== name);
  return Object.fromEntries(targets.map((n) => [n, throwing()]));
}

function disabledFor(name: AllBuiltinOpName) {
  const targets = [other(name), ...(coupled[name] ?? [])].filter((n) => n !== name);
  return Object.fromEntries(targets.map((n) => [n, false]));
}

describe.each(cases)("$name is independent", ({ name, call, http, mock }) => {
  function httpApi(operations: Record<string, unknown>) {
    const seen: string[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request: TransportRequest) => {
        seen.push(`${request.method} ${request.url.replace("https://api.example.com", "")}`);
        return {
          body:
            name === "count"
              ? 3
              : name === "getAll" ||
                  name === "getMany" ||
                  name === "findFirst" ||
                  name === "createMany"
                ? [{ id: 1 }]
                : { id: 1 },
        };
      }),
      resources: { users: { path: "/users", operations } as never },
    });
    return {
      users: api.users as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>,
      seen,
    };
  }

  function mockApi(operations: Record<string, unknown>) {
    const api = defineApi({
      baseURL: "https://example.com/v1",
      resources: { users: { path: "/users", mock: seed(), operations } as never },
    });
    return api.users as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  }

  it("exists by default", () => {
    expect(typeof httpApi({}).users[name]).toBe("function");
    expect(typeof mockApi({})[name]).toBe("function");
  });

  it("sends its own HTTP request when other builtins are disabled or overridden", async () => {
    for (const operations of [disabledFor(name), overridesFor(name)]) {
      const { users, seen } = httpApi(operations);
      expect(users[name]).toBeTypeOf("function");
      await call(users);
      expect(seen).toEqual([http]);
    }
  });

  it("runs directly against the mock store when other builtins are disabled or overridden", async () => {
    for (const operations of [disabledFor(name), overridesFor(name)]) {
      mock(await call(mockApi(operations)));
    }
  });
});

describe("HTTP-specific strategies", () => {
  it("exists maps HTTP 404 to false without error middleware seeing an error", async () => {
    let errors = 0;
    const api = defineApi({
      baseURL: "https://api.example.com",
      middleware: { onError: [() => void errors++] },
      transport: createFakeTransport(() => ({ status: 404, body: { message: "nope" } })),
      resources: { users: { path: "/users" } },
    });
    expect(await api.users.exists(9)).toBe(false);
    expect(errors).toBe(0);
  });

  it("getMany and findFirst process array responses independently", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: [{ id: 5 }, { id: 6 }] })),
      resources: { users: { path: "/users" } },
    });
    expect(await api.users.getMany([5, 6])).toEqual([{ id: 5 }, { id: 6 }]);
    expect(await api.users.findFirst({ query: { id: 5 } })).toEqual({ id: 5 });
  });
});
