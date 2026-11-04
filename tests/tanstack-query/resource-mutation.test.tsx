/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResourceMutation } from "../../packages/tanstack-query/src/use-resource-mutation.js";
import { useResourceQuery } from "../../packages/tanstack-query/src/use-resource-query.js";
import { readsDuringRender } from "../helpers/render.js";

const counter = vi.hoisted(() => ({ observers: 0 }));
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  class CountingObserver extends actual.MutationObserver<unknown, Error, unknown, unknown> {
    constructor(...args: ConstructorParameters<typeof actual.MutationObserver>) {
      super(...(args as [never, never]));
      counter.observers++;
    }
  }
  return { ...actual, MutationObserver: CountingObserver };
});

type User = { id: string; name: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeUsers() {
  let users: User[] = [{ id: "1", name: "Ada" }];
  let next = 2;
  return {
    getAll: vi.fn(async () => [...users]),
    getById: vi.fn(async (id: string) => users.find((u) => u.id === id)!),
    create: vi.fn(async (body: Omit<User, "id">) => {
      const created = { id: String(next++), ...body };
      users = [...users, created];
      return created;
    }),
    update: vi.fn(async (id: string, body: Partial<User>) => {
      users = users.map((u) => (u.id === id ? { ...u, ...body } : u));
      return users.find((u) => u.id === id)!;
    }),
    delete: vi.fn(async (id: string) => {
      users = users.filter((u) => u.id !== id);
    }),
    archive: vi.fn(async (id: string) => ({ id, archived: true })),
  };
}

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  counter.observers = 0;
});

describe("resource-wide useResourceMutation", () => {
  it("inherits every operation, runs them with their own arguments, and creates observers lazily", async () => {
    const users = fakeUsers();
    const { result } = renderHook(() => useResourceMutation(users, { queryKey: ["users"] }), {
      wrapper: wrap(newClient()),
    });
    expect(counter.observers).toBe(0);
    expect(Object.keys(result.current.operations).sort()).toEqual(
      ["archive", "create", "delete", "getAll", "getById", "update"].sort(),
    );

    const created = await act(() => result.current.create({ name: "Grace" }));
    expect(created).toEqual({ id: "2", name: "Grace" });
    expect(users.create).toHaveBeenCalledWith({ name: "Grace" });
    expect(counter.observers).toBe(1);

    await act(() => result.current.update("2", { name: "Hopper" }));
    expect(users.update).toHaveBeenCalledWith("2", { name: "Hopper" });
    await act(() => result.current.operations.archive("2"));
    expect(users.archive).toHaveBeenCalledWith("2");
    expect(counter.observers).toBe(3);
    expect(users.delete).not.toHaveBeenCalled();
  });

  it("keeps independent native states per operation", async () => {
    const users = fakeUsers();
    const { result } = renderHook(
      () => {
        const m = useResourceMutation(users, { queryKey: ["users"] });
        void m.states.create.status;
        void m.states.update.status;
        return m;
      },
      { wrapper: wrap(newClient()) },
    );
    expect(result.current.states.create.isIdle).toBe(true);
    await act(() => result.current.create({ name: "Grace" }));
    await waitFor(() => expect(result.current.states.create.isSuccess).toBe(true));
    expect(result.current.states.create.data).toEqual({ id: "2", name: "Grace" });
    expect(result.current.states.update.isIdle).toBe(true);

    users.update.mockRejectedValueOnce(new Error("conflict"));
    await act(async () => {
      await expect(result.current.update("1", { name: "X" })).rejects.toThrow("conflict");
    });
    await waitFor(() => expect(result.current.states.update.isError).toBe(true));
    expect(result.current.states.update.error?.message).toBe("conflict");
    expect(result.current.states.create.isSuccess).toBe(true);
  });

  it("resolves concurrent calls independently; state follows the latest call", async () => {
    const users = fakeUsers();
    const first = deferred<User>();
    const second = deferred<User>();
    users.create
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { result } = renderHook(
      () => {
        const m = useResourceMutation(users, { queryKey: ["users"] });
        void m.states.create.status;
        return m;
      },
      { wrapper: wrap(newClient()) },
    );
    let a!: Promise<User>;
    let b!: Promise<User>;
    act(() => {
      a = result.current.create({ name: "A" });
      b = result.current.create({ name: "B" });
    });
    await waitFor(() => expect(result.current.states.create.isPending).toBe(true));
    await act(async () => {
      second.resolve({ id: "b", name: "B" });
      await b;
    });
    await waitFor(() => expect(result.current.states.create.data).toEqual({ id: "b", name: "B" }));
    await act(async () => {
      first.resolve({ id: "a", name: "A" });
      await a;
    });
    await expect(a).resolves.toEqual({ id: "a", name: "A" });
    await expect(b).resolves.toEqual({ id: "b", name: "B" });
    expect(result.current.states.create.variables).toEqual([{ name: "B" }]);
  });

  it("forwards native options: retry, retryDelay, meta, gcTime, scope (serial), onMutate context", async () => {
    const users = fakeUsers();
    const client = newClient();
    users.update.mockRejectedValueOnce(new Error("flaky"));
    const order: string[] = [];
    const gate = deferred<User>();
    users.create.mockImplementationOnce(async (body) => {
      order.push(`start ${body.name}`);
      const value = await gate.promise;
      order.push(`end ${body.name}`);
      return value;
    });
    users.create.mockImplementationOnce(async (body) => {
      order.push(`start ${body.name}`);
      return { id: "9", ...body };
    });
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () =>
        useResourceMutation(users, {
          queryKey: ["users"],
          mutations: {
            update: { retry: 1, retryDelay: 0, meta: { audit: "u" }, gcTime: 1234 },
            create: {
              scope: { id: "serial" },
              onMutate: () => ({ snapshot: true }),
              onSuccess,
            },
          },
        }),
      { wrapper: wrap(client) },
    );
    await act(() => result.current.update("1", { name: "Retried" }));
    expect(users.update).toHaveBeenCalledTimes(2);
    const updateMutation = client
      .getMutationCache()
      .find({ mutationKey: ["users", "mutation", "update"] })!;
    expect(updateMutation.options.meta).toEqual({ audit: "u" });
    expect(updateMutation.options.gcTime).toBe(1234);

    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    act(() => {
      p1 = result.current.create({ name: "one" });
      p2 = result.current.create({ name: "two" });
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(["start one"]);
    await act(async () => {
      gate.resolve({ id: "8", name: "one" });
      await Promise.all([p1, p2]);
    });
    expect(order).toEqual(["start one", "end one", "start two"]);
    expect(onSuccess.mock.calls[0]![2]).toEqual({ snapshot: true });
  });

  it("does not retry writes by default (TanStack's mutation default)", async () => {
    const users = fakeUsers();
    users.create.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useResourceMutation(users, { queryKey: ["users"] }), {
      wrapper: wrap(newClient()),
    });
    await act(async () => {
      await expect(result.current.create({ name: "X" })).rejects.toThrow("down");
    });
    expect(users.create).toHaveBeenCalledTimes(1);
  });

  it("invalidates the observed list by default, awaiting it before onSuccess", async () => {
    const users = fakeUsers();
    const client = newClient();
    renderHook(() => readsDuringRender(useResourceQuery(users, { queryKey: ["users"] }), "data"), {
      wrapper: wrap(client),
    });
    await waitFor(() => expect(users.getAll).toHaveBeenCalledTimes(1));
    const seen: number[] = [];
    const { result } = renderHook(
      () =>
        useResourceMutation(users, {
          queryKey: ["users"],
          mutations: {
            create: { onSuccess: () => void seen.push(users.getAll.mock.calls.length) },
          },
        }),
      { wrapper: wrap(client) },
    );
    await act(() => result.current.create({ name: "Grace" }));
    expect(seen).toEqual([2]);
  });

  it("supports lists-only, detail, callback, and disabled invalidation; reads never invalidate", async () => {
    const users = fakeUsers();
    const client = newClient();
    const seed = () => {
      client.setQueryData(["users", "list"], []);
      client.setQueryData(["users", "detail", "1"], { id: "1" });
      client.setQueryData(["users", "detail", "2"], { id: "2" });
    };
    const stale = () =>
      ["list", "detail/1", "detail/2"].filter(
        (k) => client.getQueryState(["users", ...k.split("/")])?.isInvalidated,
      );
    const callback = vi.fn();
    const { result } = renderHook(
      () =>
        useResourceMutation(users, {
          queryKey: ["users"],
          mutations: {
            create: { invalidate: "lists" },
            update: { invalidate: { details: (_data, [id]) => [id] } },
            delete: { invalidate: false },
            archive: { invalidate: callback },
          },
        }),
      { wrapper: wrap(client) },
    );
    seed();
    await act(() => result.current.create({ name: "A" }));
    expect(stale()).toEqual(["list"]);
    client.clear();
    seed();
    await act(() => result.current.update("1", { name: "B" }));
    expect(stale()).toEqual(["detail/1"]);
    client.clear();
    seed();
    await act(() => result.current.delete("2"));
    await act(() => result.current.getById("1"));
    expect(stale()).toEqual([]);
    await act(() => result.current.archive("1"));
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ data: { id: "1", archived: true }, args: ["1"] }),
    );
  });

  it("supports native optimistic updates with rollback through onMutate / onError", async () => {
    const users = fakeUsers();
    const client = newClient();
    client.setQueryData(["users", "list"], [{ id: "1", name: "Ada" }]);
    users.update.mockRejectedValueOnce(new Error("rejected"));
    const { result } = renderHook(
      () =>
        useResourceMutation(users, {
          queryKey: ["users"],
          mutations: {
            update: {
              invalidate: false,
              // Annotated so TypeScript can infer the context before typing onError (see README).
              onMutate: async ([id, body]: Parameters<typeof users.update>) => {
                const previous = client.getQueryData<User[]>(["users", "list"]);
                client.setQueryData<User[]>(["users", "list"], (list) =>
                  list?.map((u) => (u.id === id ? { ...u, ...body } : u)),
                );
                return { previous };
              },
              onError: (_error, _args, context) => {
                client.setQueryData(["users", "list"], context?.previous);
              },
            },
          },
        }),
      { wrapper: wrap(client) },
    );
    const pending = act(async () => {
      await expect(result.current.update("1", { name: "Optimistic" })).rejects.toThrow("rejected");
    });
    await pending;
    expect(client.getQueryData(["users", "list"])).toEqual([{ id: "1", name: "Ada" }]);
  });

  it("runs client-only operations through the same lifecycle", async () => {
    const users = fakeUsers();
    const external = vi.fn(async (id: string) => ({ exported: id }));
    const { result } = renderHook(
      () =>
        useResourceMutation(users, {
          queryKey: ["users"],
          mutations: { exportUser: { mutationFn: external, invalidate: false } },
        }),
      { wrapper: wrap(newClient()) },
    );
    expect(await act(() => result.current.exportUser("7"))).toEqual({ exported: "7" });
    expect(external).toHaveBeenCalledWith("7");
    // Like useMutation, observer state is published through TanStack's batched notifier.
    await waitFor(() => expect(result.current.states.exportUser.data).toEqual({ exported: "7" }));
  });

  it("rejects redefining inherited operations and unknown operations without mutationFn", () => {
    const users = fakeUsers();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      renderHook(
        () =>
          useResourceMutation(users, {
            queryKey: ["users"],
            mutations: { create: { mutationFn: async () => ({}) } } as never,
          }),
        { wrapper: wrap(newClient()) },
      ),
    ).toThrow(/cannot take a mutationFn/);
    expect(() =>
      renderHook(
        () =>
          useResourceMutation(users, {
            queryKey: ["users"],
            mutations: { archvie: { retry: 1 } } as never,
          }),
        { wrapper: wrap(newClient()) },
      ),
    ).toThrow(/needs a mutationFn/);
    spy.mockRestore();
  });

  it("uses the latest options after a re-render", async () => {
    const users = fakeUsers();
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ onSuccess }) =>
        useResourceMutation(users, { queryKey: ["users"], mutations: { create: { onSuccess } } }),
      { wrapper: wrap(newClient()), initialProps: { onSuccess: first } },
    );
    await act(() => result.current.create({ name: "A" }));
    rerender({ onSuccess: second });
    await act(() => result.current.create({ name: "B" }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("follows resource and QueryClient changes", async () => {
    const a = fakeUsers();
    const b = fakeUsers();
    const clientA = newClient();
    const clientB = newClient();
    let client = clientA;
    const { result, rerender } = renderHook(
      ({ resource }) => useResourceMutation(resource, { queryKey: ["users"] }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
        initialProps: { resource: a },
      },
    );
    await act(() => result.current.create({ name: "A" }));
    rerender({ resource: b });
    await act(() => result.current.create({ name: "B" }));
    expect(a.create).toHaveBeenCalledTimes(1);
    expect(b.create).toHaveBeenCalledTimes(1);
    client = clientB;
    rerender({ resource: b });
    await act(() => result.current.create({ name: "C" }));
    expect(clientB.getMutationCache().getAll()).toHaveLength(1);
    expect(clientA.getMutationCache().getAll()).toHaveLength(2);
  });

  it("lets an in-flight mutation settle after unmount without errors", async () => {
    const users = fakeUsers();
    const gate = deferred<User>();
    users.create.mockImplementationOnce(() => gate.promise);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result, unmount } = renderHook(
      () => {
        const m = useResourceMutation(users, { queryKey: ["users"] });
        void m.states.create.status;
        return m;
      },
      { wrapper: wrap(newClient()) },
    );
    let pending!: Promise<User>;
    act(() => {
      pending = result.current.create({ name: "Late" });
    });
    unmount();
    gate.resolve({ id: "9", name: "Late" });
    await expect(pending).resolves.toEqual({ id: "9", name: "Late" });
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("throws to an error boundary with native throwOnError", async () => {
    const users = fakeUsers();
    users.delete.mockRejectedValueOnce(new Error("forbidden"));
    class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
      state: { error?: Error } = {};
      static getDerivedStateFromError(error: Error) {
        return { error };
      }
      render() {
        return this.state.error ? <p>caught: {this.state.error.message}</p> : this.props.children;
      }
    }
    let remove!: (id: string) => Promise<void>;
    function Users() {
      const m = useResourceMutation(users, {
        queryKey: ["users"],
        mutations: { delete: { throwOnError: true } },
      });
      remove = m.delete;
      return <p>ok</p>;
    }
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const view = render(
      <QueryClientProvider client={newClient()}>
        <Boundary>
          <Users />
        </Boundary>
      </QueryClientProvider>,
    );
    await act(async () => {
      await remove("1").catch(() => undefined);
    });
    await waitFor(() => expect(view.getByText("caught: forbidden")).toBeTruthy());
    errors.mockRestore();
  });
});
