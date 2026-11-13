import {
  defineApi,
  defineApis,
  resetMock,
  type ApiRequest,
  type MockError,
  type TransportRequest,
} from "@apixa/core";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string; active: boolean; archived?: boolean };
const users = (): User[] => [
  { id: "1", name: "Adam", active: true },
  { id: "2", name: "Sarah", active: false },
  { id: "3", name: "Grace", active: true },
];

/** A transport that fails the test if anything reaches it. */
const network = () => {
  const sent: TransportRequest[] = [];
  return {
    sent,
    transport: createFakeTransport((request) => {
      sent.push(request);
      return { body: [] };
    }),
  };
};

describe("custom reads", () => {
  const { transport, sent } = network();
  const api = defineApi({
    baseURL: "https://x.dev/v1",
    transport,
    resources: {
      users: {
        path: "/users",
        mock: users(),
        operations: {
          getActive: {
            kind: "read",
            method: "GET",
            path: "/active",
            mock: ({ records }) => {
              expectTypeOf(records[0]?.name).toEqualTypeOf<string | undefined>();
              return records.filter((user) => user.active);
            },
          },
          summary: {
            kind: "read",
            method: "GET",
            path: "/summary",
            mock: async ({ records }) => ({
              total: records.length,
              active: records.filter((u) => u.active).length,
            }),
          },
          byName: {
            kind: "read",
            method: "GET",
            path: "/by-name/:name",
            mock: ({ store, params }) => store.list({ name: String(params.name) })[0] ?? null,
          },
          byStatus: {
            kind: "read",
            method: "GET",
            path: "/by-status",
            mock: ({ records, query }) => records.filter((u) => String(u.active) === query.status),
          },
          nobody: { kind: "read", method: "GET", path: "/nobody", mock: () => [] },
          noRecordsRead: {
            kind: "read",
            method: "GET",
            path: "/lazy",
            mock: ({ store }) => store.exists("1"),
          },
        },
      },
    },
  });

  it("filters typed records", async () => {
    expect(await api.users.getActive()).toEqual([
      { id: "1", name: "Adam", active: true },
      { id: "3", name: "Grace", active: true },
    ]);
  });

  it("returns aggregates, single records, null and empty results", async () => {
    expect(await api.users.summary()).toEqual({ total: 3, active: 2 });
    expect(await api.users.byName({ params: { name: "Grace" } })).toMatchObject({ id: "3" });
    expect(await api.users.byName({ params: { name: "Nobody" } })).toBeNull();
    expect(await api.users.nobody()).toEqual([]);
    expect(await api.users.noRecordsRead()).toBe(true);
  });

  it("passes the request query", async () => {
    expect(
      ((await api.users.byStatus({ query: { status: "false" } })) as User[]).map((u) => u.name),
    ).toEqual(["Sarah"]);
  });

  it("never reaches the transport and returns copies", async () => {
    const first = (await api.users.getActive()) as User[];
    first[0]!.name = "HACKED";
    expect(((await api.users.getActive()) as User[])[0]?.name).toBe("Adam");
    expect(sent).toEqual([]);
  });

  it("returns the full response with status 200", async () => {
    const res = await api.users.getActive({ full: true });
    expect(res.status).toBe(200);
    expect(res.request.mocked).toBe(true);
    expect(res.request.url).toBe("https://x.dev/v1/users/active");
  });
});

describe("custom writes", () => {
  const make = () =>
    defineApi({
      baseURL: "https://x.dev",
      resources: {
        users: {
          path: "/users",
          mock: users(),
          operations: {
            archive: {
              kind: "write",
              method: "POST",
              path: "/:id/archive",
              hasBody: false,
              mock: async ({ params, store }) => store.patch(params.id, { archived: true }),
            },
            invite: {
              kind: "write",
              method: "POST",
              path: "/invite",
              mock: ({ store, body }) => store.create({ name: String(body), active: false }),
            },
            purge: {
              kind: "write",
              method: "DELETE",
              path: "/purge",
              hasBody: false,
              mock: ({ store }) => {
                for (const u of store.list({ active: false })) store.delete(u.id);
              },
            },
            activateAll: {
              kind: "write",
              method: "POST",
              path: "/activate-all",
              hasBody: false,
              mock: ({ store }) => store.list().map((u) => store.patch(u.id, { active: true })),
            },
            replace: {
              kind: "write",
              method: "PUT",
              path: "/:id/replace",
              mock: ({ store, params, body }) => store.update(params.id, body as Partial<User>),
            },
            clash: {
              kind: "write",
              method: "POST",
              path: "/clash",
              hasBody: false,
              mock: ({ store }) => store.create({ id: "1", name: "dup" }),
            },
          },
        },
      },
    });

  it("patches one record, and built-in reads see it", async () => {
    const api = make();
    expect(await api.users.archive({ params: { id: "1" } })).toMatchObject({
      id: "1",
      archived: true,
    });
    expect(await api.users.getById("1")).toMatchObject({ archived: true });
    expect((await api.users.getAll())[1]).not.toHaveProperty("archived");
  });

  it("creates, deletes, updates many, replaces", async () => {
    const api = make();
    expect(await api.users.invite("Linus")).toMatchObject({ id: "4", name: "Linus" });
    expect(await api.users.purge({ full: true }).then((r) => r.status)).toBe(204);
    expect((await api.users.getAll()).map((u) => u.id)).toEqual(["1", "3"]);
    expect(((await api.users.activateAll()) as User[]).every((u) => u.active)).toBe(true);
    expect(await api.users.replace({ name: "Replaced" }, { params: { id: "3" } })).toEqual({
      id: "3",
      name: "Replaced",
    });
  });

  it("fails like the store: not found, duplicate id", async () => {
    const api = make();
    await expect(api.users.archive({ params: { id: "zz" } })).rejects.toMatchObject({
      code: "MOCK_NOT_FOUND",
    });
    await expect(api.users.clash()).rejects.toMatchObject({ code: "MOCK_DUPLICATE_ID" });
    expect(await api.users.count()).toBe(3);
  });

  it("is isolated per client and restored by resetMock", async () => {
    const one = make();
    const two = make();
    await one.users.archive({ params: { id: "1" } });
    await one.users.purge();
    expect(await two.users.count()).toBe(3);
    expect(await two.users.getById("1")).not.toHaveProperty("archived");
    resetMock(one);
    expect(await one.users.count()).toBe(3);
    expect(await one.users.getById("1")).not.toHaveProperty("archived");
  });

  it("works with every builtin disabled", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      resources: {
        users: {
          path: "/users",
          mock: users(),
          operations: {
            preset: [],
            archive: {
              kind: "write",
              method: "POST",
              path: "/:id/archive",
              hasBody: false,
              mock: ({ store, params }) => store.patch(params.id, { archived: true }),
            },
          },
        },
      },
    });
    expect(Object.keys(api.users)).toEqual(["archive"]);
    expect(await api.users.archive({ params: { id: "2" } })).toMatchObject({ archived: true });
  });

  it("two clients over the same inline array do not share writes", async () => {
    const shared = users();
    const mk = () =>
      defineApi({
        baseURL: "https://x.dev",
        resources: {
          users: {
            path: "/users",
            mock: shared,
            operations: {
              rename: {
                kind: "write",
                method: "PATCH",
                path: "/:id/rename",
                mock: ({ store, params, body }) =>
                  store.patch(params.id, { name: (body as { name: string }).name }),
              },
            },
          },
        },
      });
    const a = mk();
    const b = mk();
    await a.users.rename({ name: "Changed" }, { params: { id: "1" } });
    expect((await b.users.getById("1")).name).toBe("Adam");
    expect(shared[0]?.name).toBe("Adam");
  });
});

describe("safety", () => {
  it("a handler is explicit behavior: the same path without one is still unsupported", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      resources: {
        users: {
          path: "/users",
          mock: [
            { id: "purge", name: "P" },
            { id: "1", name: "x" },
          ],
          operations: {
            purge: { kind: "write", method: "DELETE", path: "/purge" },
            safePurge: {
              kind: "write",
              method: "DELETE",
              path: "/safe-purge",
              mock: ({ store }) => store.delete("1"),
            },
          },
        },
      },
    });
    await expect(api.users.purge()).rejects.toMatchObject({ code: "MOCK_UNSUPPORTED" });
    expect(await api.users.count()).toBe(2);
    await api.users.safePurge();
    expect((await api.users.getAll()).map((u) => u.id)).toEqual(["purge"]);
  });

  it("unsafe keys stay rejected, and snapshots are copies", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      resources: {
        users: {
          path: "/users",
          mock: users(),
          operations: {
            evil: {
              kind: "write",
              method: "POST",
              path: "/evil",
              mock: ({ store, body }) => store.patch("1", body as Partial<User>),
            },
            tamper: {
              kind: "read",
              method: "GET",
              path: "/tamper",
              mock: ({ records }) => {
                (records[0] as User).name = "TAMPERED";
                return records.length;
              },
            },
          },
        },
      },
    });
    await expect(
      api.users.evil("1", JSON.parse('{"__proto__":{"isAdmin":true}}')),
    ).rejects.toMatchObject({ code: "MOCK_INVALID_INPUT" });
    await api.users.tamper();
    expect((await api.users.getById("1")).name).toBe("Adam");
  });

  it("a live (unmocked) resource ignores the handler and uses HTTP", async () => {
    const sent: TransportRequest[] = [];
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: createFakeTransport((request) => {
        sent.push(request);
        return { body: [{ id: "live" }] };
      }),
      resources: {
        users: {
          path: "/users",
          operations: {
            getActive: {
              kind: "read",
              method: "GET",
              path: "/active",
              mock: () => [{ id: "mock" }],
            },
          },
        },
      },
    });
    expect(await api.users.getActive()).toEqual([{ id: "live" }]);
    expect(sent.map((r) => r.url)).toEqual(["https://x.dev/users/active"]);
  });
});

describe("lifecycle", () => {
  it("runs middleware in order, hands the handler the request after middleware, and shapes the response", async () => {
    const order: string[] = [];
    let seen: unknown;
    const api = defineApi({
      baseURL: "https://x.dev",
      transforms: { request: { keys: "snake_case" } },
      middleware: {
        onRequest: [
          (request: ApiRequest) => {
            order.push("root:onRequest");
            request.query = { ...request.query, added: "by-middleware" };
          },
        ],
        onResponse: [() => void order.push("root:onResponse")],
      },
      resources: {
        users: {
          path: "/users",
          mock: users(),
          middleware: { onRequest: [() => void order.push("resource:onRequest")] },
          operations: {
            tag: {
              kind: "write",
              method: "POST",
              path: "/tag",
              middleware: { onRequest: [() => void order.push("op:onRequest")] },
              mock: ({ body, query }) => {
                order.push("handler");
                seen = { body, query };
                return { ok: true };
              },
            },
          },
        },
      },
    });
    const result = await api.users.tag({ someName: "x" });
    expect(result).toEqual({ ok: true });
    expect(order).toEqual([
      "root:onRequest",
      "resource:onRequest",
      "op:onRequest",
      "handler",
      "root:onResponse",
    ]);
    // Same as a builtin mock: the handler sees query/body after request middleware and key transforms.
    expect(seen).toEqual({ body: { some_name: "x" }, query: { added: "by-middleware" } });
  });

  it("sends handler errors through error middleware, once", async () => {
    const seen: string[] = [];
    const api = defineApi({
      baseURL: "https://x.dev",
      middleware: { onError: [(error: unknown) => void seen.push((error as Error).message)] },
      resources: {
        users: {
          path: "/users",
          mock: users(),
          operations: {
            boom: {
              kind: "read",
              method: "GET",
              path: "/boom",
              mock: async () => {
                throw new Error("handler failed");
              },
            },
          },
        },
      },
    });
    await expect(api.users.boom()).rejects.toThrow("handler failed");
    expect(seen).toEqual(["handler failed"]);
  });

  it("can be recovered by error middleware", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      middleware: { onError: [() => "fallback"] },
      resources: {
        users: {
          path: "/users",
          mock: users(),
          operations: {
            boom: {
              kind: "read",
              method: "GET",
              path: "/boom",
              mock: () => {
                throw new Error("x");
              },
            },
          },
        },
      },
    });
    expect(await api.users.boom()).toBe("fallback");
  });

  it("rejects at once on cancellation and on timeout, and tells the handler", async () => {
    const aborted = vi.fn();
    const invoked = vi.fn();
    const seenSignals: AbortSignal[] = [];
    const { transport, sent } = network();
    const api = defineApi({
      baseURL: "https://x.dev",
      transport,
      resources: {
        users: {
          path: "/users",
          mock: users(),
          operations: {
            slow: {
              kind: "write",
              method: "POST",
              path: "/slow",
              mock: async ({ signal, store }) => {
                invoked();
                seenSignals.push(signal);
                await new Promise((resolve) => setTimeout(resolve, 40));
                if (signal.aborted) {
                  aborted();
                  return null;
                }
                return store.delete("1");
              },
            },
          },
        },
      },
    });
    const early = new AbortController();
    early.abort();
    await expect(api.users.slow(undefined, { signal: early.signal })).rejects.toMatchObject({
      code: "ABORT",
    });
    expect(invoked).not.toHaveBeenCalled();
    const controller = new AbortController();
    const pending = api.users.slow(undefined, { signal: controller.signal });
    setTimeout(() => controller.abort(), 5);
    await expect(pending).rejects.toMatchObject({ code: "ABORT" });
    expect(invoked).toHaveBeenCalledTimes(1);
    expect(seenSignals[0]).toBeInstanceOf(AbortSignal);
    expect(seenSignals[0]?.aborted).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(aborted).toHaveBeenCalledTimes(1); // the handler saw `signal.aborted` and skipped its write
    expect(await api.users.count()).toBe(3);
    await expect(api.users.slow(undefined, { timeout: 5 })).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(sent).toEqual([]);
  });

  it("does not start a handler if cancellation happens while mock records become ready", async () => {
    let releaseRecords!: () => void;
    let notifyLoading!: () => void;
    const loading = new Promise<void>((resolve) => (notifyLoading = resolve));
    const recordsReady = new Promise<void>((resolve) => (releaseRecords = resolve));
    const handler = vi.fn(() => users());
    const { transport, sent } = network();
    const api = defineApi({
      baseURL: "https://x.dev",
      transport,
      resources: {
        users: {
          path: "/users",
          mock: async () => {
            notifyLoading();
            await recordsReady;
            return users();
          },
          operations: {
            slow: { kind: "read", method: "GET", path: "/slow", mock: handler },
          },
        },
      },
    });
    const controller = new AbortController();
    const pending = api.users.slow({ signal: controller.signal });
    await loading;
    controller.abort();
    releaseRecords();
    await expect(pending).rejects.toMatchObject({ code: "ABORT" });
    expect(handler).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });
});

describe("compatibility", () => {
  it("rejects bad definitions when the client is built", () => {
    const build = (operations: Record<string, unknown>) => () =>
      defineApi({
        baseURL: "https://x.dev",
        resources: { users: { path: "/users", mock: users(), operations: operations as never } },
      });
    expect(build({ a: { kind: "read", method: "GET", path: "/a", mock: 5 } })).toThrow(
      /operations\.a\.mock must be a function/,
    );
    expect(build({ getAll: { mock: () => [] } })).toThrow(/builtin "getAll".*custom operations/);
    expect(build({ a: { kind: "read", run: () => 1, mock: () => 1 } })).toThrow(/mock/);
    expect(build({ a: { method: "GET", path: "/a", mock: () => 1 } })).not.toThrow();
    expect(build({ a: { kind: "read", method: "POST", path: "/a", mock: () => 1 } })).toThrow(
      /requires kind "write"/,
    );
  });

  it("keeps builtins and function operations working next to handlers", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      resources: {
        users: {
          path: "/users",
          mock: users(),
          operations: {
            getActive: {
              kind: "read",
              method: "GET",
              path: "/active",
              mock: ({ records }) => records.filter((u) => u.active),
            },
            first: { kind: "read", run: (ctx) => ctx.request<User>({ path: "/1" }) },
            unarchive: {
              kind: "write",
              method: "POST",
              path: "/:id/unarchive",
              mock: ({ params, store }) => {
                // Typed from the path even though a function operation sits next to it.
                expectTypeOf(params).toEqualTypeOf<{ id: string | number }>();
                return store.patch(params.id, { archived: false });
              },
            },
            skipped: { kind: "read", method: "GET", path: "/skipped" },
            off: false,
          },
        },
      },
    });
    expect((await api.users.first()).name).toBe("Adam");
    expect(await api.users.getActive()).toHaveLength(2);
    expect(await api.users.count()).toBe(3);
    expect(await api.users.exists("2")).toBe(true);
  });

  it("works in defineApis, each backend with its own store", async () => {
    const apis = defineApis({
      one: {
        baseURL: "https://x.dev",
        resources: {
          users: {
            path: "/users",
            mock: users(),
            operations: {
              archive: {
                kind: "write",
                method: "POST",
                path: "/:id/archive",
                hasBody: false,
                mock: ({ store, params }) => store.patch(String(params.id), { archived: true }),
              },
            },
          },
        },
      },
      two: {
        baseURL: "https://y.dev",
        resources: { users: { path: "/users", mock: users() } },
      },
    });
    await apis.one.users.archive({ params: { id: "1" } });
    expect(await apis.one.users.getById("1")).toMatchObject({ archived: true });
    expect(await apis.two.users.getById("1")).not.toHaveProperty("archived");
  });

  it("works with provider and named-style data, and nested path parameters", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      resources: {
        members: {
          path: "/orgs/:orgId/members",
          mock: async () => [{ id: "m1", org: "o1", active: false }],
          operations: {
            activate: {
              kind: "write",
              method: "POST",
              path: "/:userId/activate",
              hasBody: false,
              mock: ({ params, store }) => {
                expectTypeOf(params).toEqualTypeOf<{
                  orgId: string | number;
                  userId: string | number;
                }>();
                return { org: params.orgId, user: store.patch(params.userId, { active: true }) };
              },
            },
          },
        },
      },
    });
    const res = await api.members.activate({ params: { orgId: "o1", userId: "m1" } });
    expect(res).toMatchObject({ org: "o1", user: { id: "m1", active: true } });
  });
});

describe("types", () => {
  it("types raw handler responses and transforms public results at each precedence level", async () => {
    type RawSnake = {
      first_name: string | undefined;
      nested_profile: { last_name: string };
      linked_users: { display_name: string }[];
    };
    type Meta = {
      rootUsers: { operations: { rootKeys: { response: RawSnake } } };
      resourceUsers: {
        operations: {
          resourceKeys: { response: { firstName: string } };
          operationKeys: { response: RawSnake };
        };
      };
    };
    const api = defineApi<Meta>()({
      baseURL: "https://x.dev",
      transforms: { response: { keys: "camelCase" } },
      resources: {
        rootUsers: {
          path: "/root-users",
          mock: [{ id: "1", first_name: "Adam" }],
          operations: {
            rootKeys: {
              kind: "read",
              method: "GET",
              path: "/root",
              mock: ({ records }) => ({
                first_name: records[0]?.first_name,
                nested_profile: { last_name: "Smith" },
                linked_users: [{ display_name: "Eve" }],
              }),
            },
          },
        },
        resourceUsers: {
          path: "/resource-users",
          mock: [{ id: "1", first_name: "Adam" }],
          transforms: { response: { keys: "snake_case" } },
          operations: {
            resourceKeys: {
              kind: "read",
              method: "GET",
              path: "/resource",
              mock: () => ({ firstName: "Adam" }),
            },
            operationKeys: {
              kind: "read",
              method: "GET",
              path: "/operation",
              transforms: { response: { keys: "camelCase" } },
              mock: async () => ({
                first_name: "Adam",
                nested_profile: { last_name: "Smith" },
                linked_users: [{ display_name: "Eve" }],
              }),
            },
          },
        },
      },
    });
    const rootResult = await api.rootUsers.rootKeys();
    expectTypeOf(rootResult.firstName).toEqualTypeOf<string | undefined>();
    expectTypeOf(rootResult.nestedProfile.lastName).toEqualTypeOf<string>();
    expectTypeOf(rootResult.linkedUsers[0]?.displayName).toEqualTypeOf<string | undefined>();
    expect(rootResult).toEqual({
      firstName: "Adam",
      nestedProfile: { lastName: "Smith" },
      linkedUsers: [{ displayName: "Eve" }],
    });
    const resourceResult = await api.resourceUsers.resourceKeys();
    expectTypeOf(resourceResult.first_name).toEqualTypeOf<string>();
    expect(resourceResult).toEqual({ first_name: "Adam" });
    const operationResult = await api.resourceUsers.operationKeys();
    expectTypeOf(operationResult.firstName).toEqualTypeOf<string | undefined>();
    expectTypeOf(operationResult.nestedProfile.lastName).toEqualTypeOf<string>();
    expect(operationResult).toEqual({
      firstName: "Adam",
      nestedProfile: { lastName: "Smith" },
      linkedUsers: [{ displayName: "Eve" }],
    });
  });

  it("accepts raw metadata responses without transforms and rejects wrong response shapes", async () => {
    type Meta = { users: { operations: { profile: { response: { first_name: string } } } } };
    const api = defineApi<Meta>()({
      baseURL: "https://x.dev",
      resources: {
        users: {
          path: "/users",
          mock: [{ id: "1", first_name: "Adam" }],
          operations: {
            profile: {
              kind: "read",
              method: "GET",
              path: "/profile",
              mock: ({ records }) => ({ first_name: records[0]!.first_name }),
            },
          },
        },
      },
    });
    expectTypeOf(await api.users.profile()).toEqualTypeOf<{ first_name: string }>();
    expect(await api.users.profile()).toEqual({ first_name: "Adam" });
    const check = () =>
      defineApi<Meta>()({
        baseURL: "https://x.dev",
        transforms: { response: { keys: "camelCase" } },
        resources: {
          users: {
            path: "/users",
            mock: [{ id: "1", first_name: "Adam" }],
            // @ts-expect-error metadata describes raw first_name, not public firstName
            operations: {
              profile: {
                kind: "read",
                method: "GET",
                path: "/profile",
                mock: () => ({ firstName: "Adam" }),
              },
            },
          },
        },
      });
    expect(check).toBeTypeOf("function");
  });

  it("keeps one defineApis backend's records and full path parameters precise", async () => {
    const apis = defineApis({
      backend: {
        baseURL: "https://x.dev",
        resources: {
          users: {
            path: "/organizations/:orgId/users",
            mock: [{ id: "1", name: "Adam", active: true }],
            operations: {
              getActive: {
                kind: "read",
                method: "GET",
                path: "/:userId/active",
                mock: ({ records, params }) => {
                  expectTypeOf(records[0]?.name).toEqualTypeOf<string | undefined>();
                  expectTypeOf(records[0]?.active).toEqualTypeOf<boolean | undefined>();
                  expectTypeOf(params).toEqualTypeOf<{
                    orgId: string | number;
                    userId: string | number;
                  }>();
                  // @ts-expect-error invalid entity field
                  records[0]?.doesNotExist;
                  // @ts-expect-error invalid path parameter
                  params.invalidParam;
                  return records.filter((user) => user.active);
                },
              },
            },
          },
        },
      },
    });
    expectTypeOf(
      await apis.backend.users.getActive({ params: { orgId: "a", userId: "1" } }),
    ).toEqualTypeOf<unknown>();
  });

  it("keeps independent defineApis record sources and metadata payloads", () => {
    type Defs = {
      inline: {
        users: {
          operations: {
            updateName: {
              body: { name: string };
              query: { dry?: boolean };
              response: { id: number; name: string; nickname?: string };
            };
          };
        };
      };
      named: { products: { operations: { getPrice: { response: { price: number } } } } };
      provided: { members: { operations: { getMember: { response: { active: boolean } } } } };
    };
    const check = () => {
      const apis = defineApis<Defs>()({
        inline: {
          baseURL: "https://x.dev",
          resources: {
            users: {
              path: "/orgs/:orgId/users",
              mock: [
                { id: 1, name: "Adam", nickname: "A" },
                { id: 2, name: "Eve" },
              ],
              operations: {
                updateName: {
                  kind: "write",
                  method: "PATCH",
                  path: "/:userId/name",
                  mock: ({ records, params, body, query, store }) => {
                    expectTypeOf(records[0]?.nickname).toEqualTypeOf<string | undefined>();
                    expectTypeOf(records[0]?.id).toEqualTypeOf<number | undefined>();
                    expectTypeOf(body).toEqualTypeOf<{ name: string }>();
                    expectTypeOf(query).toEqualTypeOf<{ dry?: boolean }>();
                    expectTypeOf(params).toEqualTypeOf<{
                      orgId: string | number;
                      userId: string | number;
                    }>();
                    // @ts-expect-error an inline user has no price
                    records[0]?.price;
                    // @ts-expect-error the full path has no productId
                    params.productId;
                    return store.patch(params.userId, { name: body.name });
                  },
                },
              },
            },
          },
        },
        named: {
          baseURL: "https://y.dev",
          resources: {
            products: {
              path: "/products",
              mock: "products-mock",
              operations: {
                getPrice: {
                  kind: "read",
                  method: "GET",
                  path: "/:productId/price",
                  mock: ({ records, params }) => {
                    expectTypeOf(records[0]?.price).toEqualTypeOf<number | undefined>();
                    // @ts-expect-error a product has no nickname
                    records[0]?.nickname;
                    // @ts-expect-error this operation has no orgId
                    params.orgId;
                    return { price: records.find((p) => p.id === params.productId)?.price ?? 0 };
                  },
                },
              },
            },
          },
        },
        provided: {
          baseURL: "https://z.dev",
          resources: {
            members: {
              path: "/teams/:teamId/members",
              mock: async () => [{ id: "m1", active: true }],
              operations: {
                getMember: {
                  kind: "read",
                  method: "GET",
                  path: "/:memberId",
                  mock: ({ records, params }) => {
                    expectTypeOf(records[0]?.active).toEqualTypeOf<boolean | undefined>();
                    // @ts-expect-error a member has no price
                    records[0]?.price;
                    // @ts-expect-error this path has no userId
                    params.userId;
                    return { active: records[0]?.active ?? false };
                  },
                },
              },
            },
          },
        },
      });
      expectTypeOf(apis.inline.users.updateName).toBeFunction();
      expectTypeOf(apis.named.products.getPrice).toBeFunction();
      expectTypeOf(apis.provided.members.getMember).toBeFunction();
      expectTypeOf(apis.inline.users.getById).toBeFunction();
      expectTypeOf(apis.named.products.getById).toBeFunction();
      expectTypeOf(
        apis.inline.users.updateName({ name: "A" }, { params: { orgId: "a", userId: "1" } }),
      ).toEqualTypeOf<Promise<{ id: number; name: string; nickname?: string }>>();
      expectTypeOf(apis.named.products.getPrice({ params: { productId: "p1" } })).toEqualTypeOf<
        Promise<{ price: number }>
      >();
      expectTypeOf(
        apis.provided.members.getMember({ params: { teamId: "t1", memberId: "m1" } }),
      ).toEqualTypeOf<Promise<{ active: boolean }>>();
    };
    expect(check).toBeTypeOf("function");
  });

  it("types the declared body, query and response from metadata", async () => {
    type Meta = {
      users: {
        entity: User;
        operations: {
          activate: { body: { id: string }; query: { dry?: boolean }; response: User };
        };
      };
    };
    const api = defineApi<Meta>()({
      baseURL: "https://x.dev",
      resources: {
        users: {
          path: "/users",
          mock: users(),
          operations: {
            activate: {
              kind: "write",
              method: "POST",
              path: "/activate",
              mock: ({ body, query, store }) => {
                expectTypeOf(body).toEqualTypeOf<{ id: string }>();
                expectTypeOf(query).toEqualTypeOf<{ dry?: boolean }>();
                return store.patch(body.id, { active: true });
              },
            },
          },
        },
      },
    });
    expect(await api.users.activate({ id: "2" })).toMatchObject({ id: "2", active: true });
  });

  it("rejects wrong handler shapes at compile time", () => {
    type Meta = { users: { operations: { stats: { response: { total: number } } } } };
    const check = () => {
      defineApi<Meta>()({
        baseURL: "https://x.dev",
        resources: {
          users: {
            path: "/users",
            mock: users(),
            // @ts-expect-error the declared response is { total: number }, the handler returns { count }
            operations: {
              stats: { kind: "read", method: "GET", path: "/stats", mock: () => ({ count: 1 }) },
            },
          },
        },
      });
      defineApi({
        baseURL: "https://x.dev",
        resources: {
          users: {
            path: "/users",
            mock: users(),
            operations: {
              a: {
                kind: "write",
                method: "POST",
                path: "/a",
                // @ts-expect-error `nope` is not a field of the records
                mock: ({ store }) => store.patch("1", { nope: true }),
              },
            },
          },
        },
      });
      defineApi({
        baseURL: "https://x.dev",
        resources: {
          users: {
            path: "/users",
            mock: users(),
            operations: {
              b: {
                kind: "write",
                method: "POST",
                path: "/b/:id",
                // @ts-expect-error `typo` is not a path parameter of /b/:id
                mock: ({ params }) => params.typo,
              },
            },
          },
        },
      });
      defineApi({
        baseURL: "https://x.dev",
        resources: {
          users: {
            path: "/users",
            mock: users(),
            // @ts-expect-error mock must be a function
            operations: { c: { kind: "read", method: "GET", path: "/c", mock: 5 } },
          },
        },
      });
      defineApi({
        baseURL: "https://x.dev",
        resources: {
          // @ts-expect-error builtins are simulated by Core
          users: { path: "/users", mock: users(), operations: { getAll: { mock: () => [] } } },
        },
      });
      defineApi({
        baseURL: "https://x.dev",
        resources: {
          users: {
            path: "/users",
            mock: users(),
            // Declarative HTTP operations derive kind from their method.
            operations: { d: { method: "GET", path: "/d", mock: () => 1 } },
          },
        },
      });
    };
    expect(check).toBeTypeOf("function");
  });
});
