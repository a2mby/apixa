import {
  ConfigError,
  defineApi,
  getOperationMetadata,
  OPERATION_METADATA,
  type OperationKindsOf,
} from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string };
const seen: { url: string; method: string }[] = [];
const base = {
  baseURL: "https://api.example.com",
  transport: createFakeTransport(
    (r) => (seen.push({ url: r.url, method: r.method }), { body: [] }),
  ),
};

describe("custom operation classification (kind)", () => {
  const api = defineApi<{ users: { entity: User } }>()({
    ...base,
    resources: {
      users: {
        path: "/users",
        operations: {
          deleteMany: false,
          stats: { kind: "read", method: "GET", path: "/stats" },
          archive: { method: "POST", path: "/:id/archive" },
          report: {
            kind: "read",
            run: async (ctx, range: "day" | "week") =>
              ctx.request<{ total: number }>({ path: "/report", query: { range } }),
          },
          legacy: async (ctx, id: string) => ctx.request<User>({ path: `/${id}/legacy` }),
          getAll: async (ctx, team: string) => ctx.request<User[]>({ query: { team } }),
        },
      },
      org: { path: "/orgs/:orgId/users", operationGroups: { extended: false } },
    },
  });

  it("classifies builtins by convention and custom operations by kind (default write)", () => {
    const meta = getOperationMetadata(api.users)!;
    expect(meta.getById).toMatchObject({ kind: "read", builtin: true, implementation: "request" });
    expect(meta.create).toMatchObject({ kind: "write", builtin: true });
    expect(meta.stats).toMatchObject({ kind: "read", builtin: false, implementation: "request" });
    expect(meta.archive).toMatchObject({ kind: "write", builtin: false });
    expect(meta.report).toMatchObject({
      kind: "read",
      implementation: "function",
      optionsIndex: null,
    });
    expect(meta.legacy).toMatchObject({ kind: "write", implementation: "function" });
    expect(meta.getAll).toMatchObject({ kind: "read", builtin: true, implementation: "function" });
    expect(meta.deleteMany).toBeUndefined();

    type Kinds = OperationKindsOf<typeof api.users>;
    expectTypeOf<Kinds["getById"]>().toEqualTypeOf<"read">();
    expectTypeOf<Kinds["create"]>().toEqualTypeOf<"write">();
    expectTypeOf<Kinds["stats"]>().toEqualTypeOf<"read">();
    expectTypeOf<Kinds["report"]>().toEqualTypeOf<"read">();
    expectTypeOf<Kinds["archive"]>().toEqualTypeOf<"write">();
    expectTypeOf<Kinds["legacy"]>().toEqualTypeOf<"write">();
    expectTypeOf<Kinds["getAll"]>().toEqualTypeOf<"read">();
    expectTypeOf<Kinds>().not.toHaveProperty("deleteMany");
  });

  it("records the RequestOptions position from Core's argument layout", () => {
    const users = getOperationMetadata(api.users)!;
    expect(users.getById!.optionsIndex).toBe(1);
    expect(users.create!.optionsIndex).toBe(1);
    expect(users.update!.optionsIndex).toBe(2);
    expect(users.count!.optionsIndex).toBe(0);
    expect(users.findFirst!.optionsIndex).toBe(1);
    expect(users.getBy!.optionsIndex).toBe(2);
    expect(users.archive!.optionsIndex).toBe(2);
    const org = getOperationMetadata(api.org)!;
    expect(org.getAll!.optionsIndex).toBe(1);
    expect(org.getById!.optionsIndex).toBe(1);
    expect(org.update!.optionsIndex).toBe(2);
  });

  it("keeps metadata non-enumerable, frozen, and outside the operation keys", () => {
    expect(Object.keys(api.users)).not.toContain(String(OPERATION_METADATA));
    expect(Object.keys(api.users).every((k) => typeof (api.users as never)[k] === "function")).toBe(
      true,
    );
    expect(Object.isFrozen(getOperationMetadata(api.users))).toBe(true);
    expect(getOperationMetadata({})).toBeUndefined();
  });

  it("executes kind / run operations exactly like the plain forms", async () => {
    seen.length = 0;
    await api.users.stats();
    await api.users.report("week");
    await api.users.legacy("7");
    expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
      "GET https://api.example.com/users/stats",
      "GET https://api.example.com/users/report?range=week",
      "GET https://api.example.com/users/7/legacy",
    ]);
    expectTypeOf(api.users.report).parameters.toEqualTypeOf<["day" | "week"]>();
    expectTypeOf(api.users.report).returns.resolves.toEqualTypeOf<{ total: number }>();
    expectTypeOf(api.users.getAll).parameters.toEqualTypeOf<[team: string]>();
  });

  it("rejects invalid kinds at runtime and compile time", () => {
    const build = (ops: unknown) => () =>
      defineApi({ ...base, resources: { u: { path: "/u", operations: ops as never } } });
    expect(build({ stats: { kind: "query", method: "GET" } })).toThrow(
      /kind must be "read" or "write"/,
    );
    expect(build({ getById: { kind: "write" } })).toThrow(/builtin "getById" is always "read"/);
    expect(build({ stats: { kind: "read", run: 1 } })).toThrow(/run must be a function/);
    expect(build({ stats: { run: async () => 1, method: "GET" } })).toThrow(
      /unknown option "method"/,
    );
    expect(build({ stats: { kind: "read", run: async () => 1 } })).not.toThrow(ConfigError);
    if (false as boolean) {
      defineApi({
        ...base,
        // @ts-expect-error builtins have a fixed kind
        resources: { u: { path: "/u", operations: { getById: { kind: "write" } } } },
      });
      defineApi({
        ...base,
        // @ts-expect-error the run form only accepts kind and run
        resources: { u: { path: "/u", operations: { s: { run: async () => 1, method: "GET" } } } },
      });
    }
  });
});
