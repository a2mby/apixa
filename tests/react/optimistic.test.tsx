/** @vitest-environment jsdom */
import type { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { OptimisticLayers } from "../../packages/react/src/optimistic.js";
import { createResourceQueryOptions } from "../../packages/react/src/query-options.js";
import { useResource } from "../../packages/react/src/use-resource.js";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { deferred, newClient, wrap } from "../helpers/query.js";

type User = { id: string; name: string; role: string };

/**
 * A fake backend whose writes finish only when the test says so. A write changes the server
 * only if it succeeds — exactly what a real backend does.
 */
function controlledServer() {
  const server = new Map<string, User>([
    ["1", { id: "1", name: "Ada", role: "dev" }],
    ["2", { id: "2", name: "Grace", role: "dev" }],
  ]);
  const pending: Array<{
    op: string;
    args: unknown[];
    ok: () => Promise<void>;
    fail: () => Promise<void>;
  }> = [];
  const settle = (op: string, args: unknown[], apply: () => unknown) => {
    const gate = deferred<void>();
    const result = gate.promise.then(apply);
    const entry = {
      op,
      args,
      ok: async () => {
        gate.resolve();
        await result.catch(() => undefined);
      },
      fail: async () => {
        gate.reject(new Error(`${op} failed`));
        await result.catch(() => undefined);
      },
    };
    pending.push(entry);
    return { result, entry };
  };
  const resource = {
    getAll: vi.fn(async () => [...server.values()]),
    getById: vi.fn(async (id: string) => ({ ...server.get(id)! })),
    update: vi.fn(
      (id: string, body: Partial<User>) =>
        settle("update", [id, body], () => {
          server.set(id, { ...server.get(id)!, ...body });
          return { ...server.get(id)! };
        }).result,
    ),
    create: vi.fn(
      (body: Omit<User, "id">) =>
        settle("create", [body], () => {
          const created = { id: String(server.size + 1), ...body };
          server.set(created.id, created);
          return created;
        }).result,
    ),
    delete: vi.fn(
      (id: string) =>
        settle("delete", [id], () => {
          server.delete(id);
        }).result,
    ),
  };
  return { server, pending, resource };
}

type Resource = ReturnType<typeof controlledServer>["resource"];

async function seed(client: QueryClient, resource: Resource) {
  await client.fetchQuery(
    createResourceQueryOptions(resource, {
      queryKey: ["users"],
      operation: "getById",
      args: ["1"],
    }),
  );
  await client.fetchQuery(
    createResourceQueryOptions(resource, {
      queryKey: ["users"],
      operation: "getById",
      args: ["2"],
    }),
  );
  await client.fetchQuery(createResourceQueryOptions(resource, { queryKey: ["users"] }));
}

const detail = (client: QueryClient, id: string) =>
  client.getQueryData<User>(["users", "detail", id]);
const layers = (client: QueryClient) => OptimisticLayers.for(client).size;

function setup(invalidate: false | "all" = false) {
  const backend = controlledServer();
  const client = newClient();
  const hook = renderHook(
    () =>
      useResourceMutation(backend.resource, {
        queryKey: ["users"],
        mutations: {
          update: {
            invalidate,
            optimistic: {
              detail: ([id]) => id,
              update: (current, [, changes]) => ({ ...current, ...changes }),
            },
          },
        },
      }),
    { wrapper: wrap(client) },
  );
  return { ...backend, client, hook };
}

/** Start a write inside act and keep its promise (it settles later). */
async function start<T>(run: () => Promise<T>): Promise<[Promise<T>]> {
  let promise!: Promise<T>;
  await act(async () => {
    promise = run();
    promise.catch(() => undefined);
    await Promise.resolve();
  });
  await waitFor(() => undefined);
  // Wrapped: an async function returning a promise would otherwise wait for it.
  return [promise];
}

describe("declarative optimistic updates", () => {
  it("applies immediately, keeps the change on success, and leaves no bookkeeping", async () => {
    const { client, resource, hook, pending } = setup();
    await seed(client, resource);
    const [call] = await start(() => hook.result.current.update("1", { name: "Ada L." }));

    await waitFor(() => expect(detail(client, "1")?.name).toBe("Ada L."));
    await act(() => pending[0]!.ok());
    await expect(call).resolves.toMatchObject({ name: "Ada L." });
    expect(detail(client, "1")).toEqual({ id: "1", name: "Ada L.", role: "dev" });
    expect(layers(client)).toBe(0);
  });

  it("rolls back on failure", async () => {
    const { client, resource, hook, pending } = setup();
    await seed(client, resource);
    const [call] = await start(() => hook.result.current.update("1", { name: "X" }));
    await waitFor(() => expect(detail(client, "1")?.name).toBe("X"));
    await act(() => pending[0]!.fail());
    await expect(call).rejects.toThrow("update failed");
    expect(detail(client, "1")).toEqual({ id: "1", name: "Ada", role: "dev" });
    expect(layers(client)).toBe(0);
  });

  it("never invents data for an entry that is not cached", async () => {
    const { client, resource, hook, pending } = setup();
    await seed(client, resource);
    await start(() => hook.result.current.update("9", { name: "X" }));
    expect(detail(client, "9")).toBeUndefined();
    await act(() => pending[0]!.ok().catch(() => undefined));
  });
});

describe("concurrent optimistic mutations on one entry (different fields)", () => {
  const cases: Array<[string, Array<["A" | "B", "ok" | "fail"]>, Partial<User>]> = [
    [
      "A succeeds, B succeeds",
      [
        ["A", "ok"],
        ["B", "ok"],
      ],
      { name: "A", role: "B" },
    ],
    [
      "A fails, B succeeds",
      [
        ["B", "ok"],
        ["A", "fail"],
      ],
      { name: "Ada", role: "B" },
    ],
    [
      "B fails, A succeeds",
      [
        ["B", "fail"],
        ["A", "ok"],
      ],
      { name: "A", role: "dev" },
    ],
    [
      "A fails, B fails",
      [
        ["A", "fail"],
        ["B", "fail"],
      ],
      { name: "Ada", role: "dev" },
    ],
    [
      "A succeeds after B",
      [
        ["B", "ok"],
        ["A", "ok"],
      ],
      { name: "A", role: "B" },
    ],
    [
      "B succeeds after A",
      [
        ["A", "ok"],
        ["B", "ok"],
      ],
      { name: "A", role: "B" },
    ],
    [
      "A fails after B fails",
      [
        ["B", "fail"],
        ["A", "fail"],
      ],
      { name: "Ada", role: "dev" },
    ],
  ];
  it.each(cases)("%s", async (_name, order, expected) => {
    const { client, resource, hook, pending } = setup();
    await seed(client, resource);
    const [a] = await start(() => hook.result.current.update("1", { name: "A" }));
    const [b] = await start(() => hook.result.current.update("1", { role: "B" }));
    await waitFor(() => expect(detail(client, "1")).toMatchObject({ name: "A", role: "B" }));
    const byName = { A: pending[0]!, B: pending[1]! };
    for (const [who, outcome] of order) {
      await act(() => (outcome === "ok" ? byName[who].ok() : byName[who].fail()));
    }
    // Each call keeps its own promise outcome.
    const outcomes = Object.fromEntries(order);
    await (outcomes.A === "ok" ? expect(a).resolves.toBeDefined() : expect(a).rejects.toThrow());
    await (outcomes.B === "ok" ? expect(b).resolves.toBeDefined() : expect(b).rejects.toThrow());
    expect(detail(client, "1")).toEqual({ id: "1", ...{ name: "Ada", role: "dev" }, ...expected });
    expect(layers(client)).toBe(0);
  });
});

describe("concurrent optimistic mutations on the same field", () => {
  it.each([
    ["A fails, B succeeds", "A", "fail", "B", "ok", "B"],
    ["B fails, A succeeds", "B", "fail", "A", "ok", "A"],
    ["A succeeds, B fails", "A", "ok", "B", "fail", "A"],
    ["both succeed", "A", "ok", "B", "ok", "B"],
  ] as const)("%s", async (_n, first, firstOutcome, second, secondOutcome, expectedName) => {
    const { client, resource, hook, pending } = setup();
    await seed(client, resource);
    await start(() => hook.result.current.update("1", { name: "A" }));
    await start(() => hook.result.current.update("1", { name: "B" }));
    // Later-started layers win while both are pending.
    await waitFor(() => expect(detail(client, "1")?.name).toBe("B"));
    const calls = { A: pending[0]!, B: pending[1]! };
    await act(() => (firstOutcome === "ok" ? calls[first].ok() : calls[first].fail()));
    await act(() => (secondOutcome === "ok" ? calls[second].ok() : calls[second].fail()));
    expect(detail(client, "1")?.name).toBe(expectedName);
    expect(layers(client)).toBe(0);
  });
});

describe("optimistic mutations and the rest of the cache", () => {
  it("separate entities are independent", async () => {
    const { client, resource, hook, pending } = setup();
    await seed(client, resource);
    await start(() => hook.result.current.update("1", { name: "A" }));
    await start(() => hook.result.current.update("2", { name: "B" }));
    await act(() => pending[0]!.fail());
    expect(detail(client, "1")?.name).toBe("Ada");
    expect(detail(client, "2")?.name).toBe("B");
    await act(() => pending[1]!.ok());
    expect(detail(client, "2")?.name).toBe("B");
    expect(layers(client)).toBe(0);
  });

  it("a refetch during a pending mutation keeps the optimistic change on top of new server data", async () => {
    const { client, resource, hook, pending, server } = setup();
    await seed(client, resource);
    await start(() => hook.result.current.update("1", { name: "A" }));
    server.set("1", { ...server.get("1")!, role: "ops" }); // someone else changed the server
    await act(() => client.refetchQueries({ queryKey: ["users", "detail", "1"] }));
    expect(detail(client, "1")).toEqual({ id: "1", name: "A", role: "ops" });
    await act(() => pending[0]!.fail());
    // Rolled back to the newer server data, not to the stale snapshot.
    expect(detail(client, "1")).toEqual({ id: "1", name: "Ada", role: "ops" });
    expect(layers(client)).toBe(0);
  });

  it("an invalidation during a pending mutation does not erase it", async () => {
    const { client, resource, hook, pending } = setup();
    await seed(client, resource);
    await start(() => hook.result.current.update("1", { name: "A" }));
    await act(() => client.invalidateQueries({ queryKey: ["users"] }));
    expect(detail(client, "1")?.name).toBe("A");
    await act(() => pending[0]!.ok());
    expect(detail(client, "1")?.name).toBe("A");
  });

  it("default invalidation: A's refetch keeps pending B, and the final state is server truth", async () => {
    const { client, resource, hook, pending, server } = setup("all");
    await seed(client, resource);
    // Invalidation refetches active queries: mount an observer of the detail.
    renderHook(
      () => useResourceQuery(resource, { queryKey: ["users"], operation: "getById", args: ["1"] }),
      { wrapper: wrap(client) },
    );
    await start(() => hook.result.current.update("1", { name: "A" }));
    await start(() => hook.result.current.update("1", { role: "B" }));
    await act(() => pending[0]!.ok()); // invalidates and refetches while B is pending
    await waitFor(() => expect(resource.getById.mock.calls.length).toBeGreaterThan(2));
    expect(detail(client, "1")).toEqual({ id: "1", name: "A", role: "B" });
    await act(() => pending[1]!.fail());
    await waitFor(() => expect(detail(client, "1")).toEqual({ ...server.get("1") }));
    expect(detail(client, "1")).toEqual({ id: "1", name: "A", role: "dev" });
    expect(layers(client)).toBe(0);
  });

  it("rolls back even when the component unmounted while pending", async () => {
    const { client, resource, hook, pending } = setup();
    await seed(client, resource);
    const [call] = await start(() => hook.result.current.update("1", { name: "X" }));
    hook.unmount();
    await act(() => pending[0]!.fail());
    await expect(call).rejects.toThrow();
    expect(detail(client, "1")?.name).toBe("Ada");
    expect(layers(client)).toBe(0);
  });

  it("a manual cache write takes the entry over (no rollback over it)", async () => {
    const { client, resource, hook, pending } = setup();
    await seed(client, resource);
    await start(() => hook.result.current.update("1", { name: "X" }));
    act(() => {
      client.setQueryData(["users", "detail", "1"], { id: "1", name: "Manual", role: "dev" });
    });
    await act(() => pending[0]!.fail());
    expect(detail(client, "1")?.name).toBe("Manual");
    expect(layers(client)).toBe(0);
  });

  it("removing the entry drops its bookkeeping", async () => {
    const { client, resource, hook, pending } = setup();
    await seed(client, resource);
    await start(() => hook.result.current.update("1", { name: "X" }));
    expect(layers(client)).toBe(1);
    act(() => client.removeQueries({ queryKey: ["users", "detail", "1"] }));
    expect(layers(client)).toBe(0);
    await act(() => pending[0]!.fail());
    expect(detail(client, "1")).toBeUndefined();
  });

  it("list updaters cover create and delete; failures remove only their own change", async () => {
    const backend = controlledServer();
    const client = newClient();
    await seed(client, backend.resource);
    const { result } = renderHook(
      () =>
        useResourceMutation(backend.resource, {
          queryKey: ["users"],
          mutations: {
            create: {
              invalidate: false,
              optimistic: {
                list: (users, [body]) => [...users, { id: "temp", ...body }],
              },
            },
            delete: {
              invalidate: false,
              optimistic: { list: (users, [id]) => users.filter((u) => u.id !== id) },
            },
          },
        }),
      { wrapper: wrap(client) },
    );
    const list = () => client.getQueryData<User[]>(["users", "list"])!.map((u) => u.id);
    await start(() => result.current.create({ name: "Linus", role: "dev" }));
    await start(() => result.current.delete("1"));
    expect(list()).toEqual(["2", "temp"]);
    await act(() => backend.pending[0]!.fail()); // create failed
    expect(list()).toEqual(["2"]);
    await act(() => backend.pending[1]!.ok());
    expect(list()).toEqual(["2"]);
    expect(layers(client)).toBe(0);
  });

  it("targets reach any entry (custom reads, infinite lists)", async () => {
    const backend = controlledServer();
    const client = newClient();
    client.setQueryData(["users", "operation", "stats"], { total: 2 });
    const { result } = renderHook(
      () =>
        useResourceMutation(backend.resource, {
          queryKey: ["users"],
          mutations: {
            create: {
              invalidate: false,
              optimistic: {
                targets: (_args, keys) => [
                  {
                    queryKey: keys.operation("stats" as never),
                    update: (stats: { total: number }) => ({ total: stats.total + 1 }),
                  },
                ],
              },
            },
          },
        }),
      { wrapper: wrap(client) },
    );
    await start(() => result.current.create({ name: "L", role: "dev" }));
    expect(client.getQueryData(["users", "operation", "stats"])).toEqual({ total: 3 });
    await act(() => backend.pending[0]!.fail());
    expect(client.getQueryData(["users", "operation", "stats"])).toEqual({ total: 2 });
  });
});

describe("callback composition", () => {
  it("runs internal work first and keeps the consumer's onMutate result as the context", async () => {
    const backend = controlledServer();
    const client = newClient();
    await seed(client, backend.resource);
    const events: string[] = [];
    const { result } = renderHook(
      () =>
        useResourceMutation(backend.resource, {
          queryKey: ["users"],
          mutations: {
            update: {
              invalidate: false,
              optimistic: {
                detail: ([id]) => id,
                update: (current, [, changes]) => ({ ...current, ...changes }),
              },
              onMutate: () => {
                events.push(`onMutate sees ${detail(client, "1")?.name}`);
                return { token: 7 };
              },
              onError: (_error, _args, context) => {
                expectTypeOf(context).toEqualTypeOf<{ token: number } | undefined>();
                events.push(`onError sees ${detail(client, "1")?.name}, ctx ${context?.token}`);
              },
              onSettled: (_d, _e, _a, context) => {
                events.push(`onSettled ctx ${context?.token}`);
              },
            },
          },
        }),
      { wrapper: wrap(client) },
    );
    await start(() => result.current.update("1", { name: "X" }));
    await act(() => backend.pending[0]!.fail());
    expect(events).toEqual(["onMutate sees X", "onError sees Ada, ctx 7", "onSettled ctx 7"]);
    expect(result.current.states.update.context).toEqual({ token: 7 });
  });

  it("mutations without optimistic config are unchanged", async () => {
    const backend = controlledServer();
    const client = newClient();
    await seed(client, backend.resource);
    const { result } = renderHook(
      () => ({
        ...useResourceMutation(backend.resource, { queryKey: ["users"] }),
        detail: useResourceQuery(backend.resource, {
          queryKey: ["users"],
          operation: "getById",
          args: ["1"],
        }),
      }),
      { wrapper: wrap(client) },
    );
    await start(() => result.current.update("1", { name: "X" }));
    expect(detail(client, "1")?.name).toBe("Ada");
    await act(() => backend.pending[0]!.ok());
    await waitFor(() => expect(detail(client, "1")?.name).toBe("X")); // default invalidation
  });

  it("validates the config", () => {
    const backend = controlledServer();
    const run = (optimistic: unknown) =>
      renderHook(
        () =>
          useResourceMutation(backend.resource, {
            queryKey: ["users"],
            mutations: { update: { optimistic } as never },
          }),
        { wrapper: wrap(newClient()) },
      );
    expect(() => run({ detail: () => "1" })).toThrow(/needs optimistic.update/);
    expect(() => run({ update: (x: unknown) => x })).toThrow(/needs optimistic.detail/);
    expect(() => run({})).toThrow(/needs detail \+ update, list, or targets/);
  });

  it("types: updaters are checked against the cached entity and the call arguments", () => {
    const backend = controlledServer();
    void (() =>
      useResource(backend.resource, {
        queryKey: ["users"],
        mutations: {
          update: {
            optimistic: {
              detail: ([id]) => id,
              // @ts-expect-error must return a User
              update: (current) => ({ ...current, name: 1 }),
            },
          },
        },
      }));
    void (() =>
      useResourceMutation(backend.resource, {
        queryKey: ["users"],
        mutations: {
          // @ts-expect-error detail needs update
          update: { optimistic: { detail: ([id]) => id } },
        },
      }));
  });
});
