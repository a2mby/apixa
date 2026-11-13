/** @vitest-environment jsdom */
import { defineApi, HttpError, type TransportRequest } from "@apixa/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { useResource } from "../../packages/react/src/use-resource.js";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { createFakeTransport } from "../helpers/fake-transport.js";
import { deferred, newClient, wrap } from "../helpers/query.js";

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

afterEach(() => {
  counter.observers = 0;
});

type User = { id: string; name: string };

function users() {
  const gates: Array<ReturnType<typeof deferred<User>>> = [];
  return {
    gates,
    resource: {
      getAll: vi.fn(async (): Promise<User[]> => []),
      create: vi.fn((body: { name: string }) => {
        const gate = deferred<User>();
        gates.push(gate);
        return gate.promise.then((user) => ({ ...user, name: body.name }));
      }),
      delete: vi.fn(async (_id: string) => undefined),
    },
  };
}

describe("direct mutation state on callable operations", () => {
  it("reads like states.*, updates reactively, and stays callable", async () => {
    const { resource, gates } = users();
    const { result } = renderHook(
      () => {
        const writes = useResourceMutation(resource, { queryKey: ["users"] });
        // Read during render, as a component would.
        return { writes, pending: writes.create.isPending, status: writes.create.status };
      },
      { wrapper: wrap(newClient()) },
    );
    expect(result.current.status).toBe("idle");
    expect(result.current.writes.create.isIdle).toBe(true);

    let call!: Promise<User>;
    act(() => {
      call = result.current.writes.create({ name: "Ada" });
    });
    await waitFor(() => expect(result.current.pending).toBe(true));
    expect(result.current.writes.create.variables).toEqual([{ name: "Ada" }]);
    expect(result.current.writes.states.create.isPending).toBe(true);

    await act(async () => {
      gates[0]!.resolve({ id: "1", name: "" });
      await call;
    });
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.writes.create.data).toEqual({ id: "1", name: "Ada" });
    expect(result.current.writes.create.data).toBe(result.current.writes.states.create.data);
    act(() => result.current.writes.create.reset());
    await waitFor(() => expect(result.current.status).toBe("idle"));
  });

  it("errors are exposed and each concurrent call keeps its own promise", async () => {
    const { resource, gates } = users();
    const { result } = renderHook(
      () => {
        const writes = useResourceMutation(resource, { queryKey: ["users"] });
        return { writes, error: writes.create.error, isError: writes.create.isError };
      },
      { wrapper: wrap(newClient()) },
    );
    let first!: Promise<User>;
    let second!: Promise<User>;
    act(() => {
      first = result.current.writes.create({ name: "A" });
      second = result.current.writes.create({ name: "B" });
    });
    await waitFor(() => expect(gates).toHaveLength(2));
    await act(async () => {
      gates[1]!.resolve({ id: "2", name: "" });
      gates[0]!.reject(new Error("boom"));
      await Promise.allSettled([first, second]);
    });
    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toEqual({ id: "2", name: "B" });
  });

  it("creates observers lazily: neither calling-less renders nor other operations create one", () => {
    const { resource } = users();
    const { result } = renderHook(() => useResourceMutation(resource, { queryKey: ["users"] }), {
      wrapper: wrap(newClient()),
    });
    expect(counter.observers).toBe(0);
    void result.current.create; // the function itself costs nothing
    expect(counter.observers).toBe(0);
    void result.current.create.isPending; // reading state creates that one observer
    expect(counter.observers).toBe(1);
    void result.current.states.create;
    expect(counter.observers).toBe(1);
  });

  it("is the same on useResource, where query isPending and create.isPending differ", async () => {
    const { resource } = users();
    const { result } = renderHook(
      () => {
        const all = useResource(resource, { queryKey: ["users"] });
        return { all, queryPending: all.isPending, createPending: all.create.isPending };
      },
      { wrapper: wrap(newClient()) },
    );
    expect(result.current.queryPending).toBe(true);
    expect(result.current.createPending).toBe(false);
    await waitFor(() => expect(result.current.all.isSuccess).toBe(true));
  });

  it("types: state fields are typed per operation; disabled operations are absent", () => {
    const api = defineApi<{ users: { entity: User } }>()({
      baseURL: "https://x.dev",
      resources: { users: { path: "/users", operations: { delete: false } } },
    });
    const { result } = renderHook(() => useResourceMutation(api.users, { queryKey: ["users"] }), {
      wrapper: wrap(newClient()),
    });
    const create = result.current.create;
    expectTypeOf(create.data).toEqualTypeOf<User | undefined>();
    expectTypeOf(create.isPending).toEqualTypeOf<boolean>();
    expectTypeOf<NonNullable<typeof create.variables>[0]>().toEqualTypeOf<
      Parameters<typeof api.users.create>[0]
    >();
    if (create.isSuccess) expectTypeOf(create.data).toEqualTypeOf<User>();
    // @ts-expect-error delete is disabled in Core
    void result.current.delete;
    // @ts-expect-error reads are not mutations
    void result.current.getAll;
  });
});

describe("idempotency keys through TanStack mutation retries", () => {
  function api(statuses: number[]) {
    const requests: TransportRequest[] = [];
    let i = 0;
    const client = defineApi({
      baseURL: "https://x.dev",
      transport: createFakeTransport((request) => {
        requests.push(request);
        const status = statuses[Math.min(i++, statuses.length - 1)]!;
        return { status, body: { id: "1", name: "Ada" } };
      }),
      resources: { users: { path: "/users", operations: { create: { idempotency: true } } } },
    });
    const keys = () => requests.map((r) => r.headers.get("idempotency-key"));
    return { client, keys };
  }

  it("one key per call, reused by TanStack retries", async () => {
    const { client, keys } = api([500, 500, 200, 200]);
    const { result } = renderHook(
      () =>
        useResourceMutation(client.users, {
          queryKey: ["users"],
          mutations: { create: { retry: 2, retryDelay: 0 } },
        }),
      { wrapper: wrap(newClient()) },
    );
    await act(() => result.current.create({ name: "Ada" }));
    expect(keys()).toHaveLength(3);
    expect(new Set(keys()).size).toBe(1);
    await act(() => result.current.create({ name: "Ada" }));
    expect(keys()[3]).not.toBe(keys()[0]);
  });

  it("an explicit key in the call options wins", async () => {
    const { client, keys } = api([200]);
    const { result } = renderHook(
      () => useResourceMutation(client.users, { queryKey: ["users"] }),
      {
        wrapper: wrap(newClient()),
      },
    );
    await act(() => result.current.create({ name: "Ada" }, { idempotencyKey: "mine" }));
    expect(keys()).toEqual(["mine"]);
  });

  it("nested Core and TanStack retries: one key for every attempt, a new key next call", async () => {
    // Core retries once inside each TanStack attempt; TanStack retries the whole call once.
    const requests: TransportRequest[] = [];
    let i = 0;
    const statuses = [503, 503, 503, 200, 200];
    const client = defineApi({
      baseURL: "https://x.dev",
      retry: { retries: 1, baseDelayMs: 0, jitter: false, methods: ["POST"] },
      transport: createFakeTransport((request) => {
        requests.push(request);
        const status = statuses[Math.min(i++, statuses.length - 1)]!;
        return { status, body: { id: "1", name: "Ada" } };
      }),
      resources: { users: { path: "/users", operations: { create: { idempotency: true } } } },
    });
    const { result } = renderHook(
      () =>
        useResourceMutation(client.users, {
          queryKey: ["users"],
          mutations: { create: { retry: 1, retryDelay: 0 } },
        }),
      { wrapper: wrap(newClient()) },
    );
    await act(() => result.current.create({ name: "Ada" }));
    const keys = requests.map((r) => r.headers.get("idempotency-key"));
    expect(keys).toHaveLength(4); // 2 Core attempts × 2 TanStack attempts
    expect(new Set(keys).size).toBe(1);
    await act(() => result.current.create({ name: "Ada" }));
    expect(requests[4]!.headers.get("idempotency-key")).not.toBe(keys[0]);
  });

  it("nested retries exhausted: the mutation rejects after 4 attempts that share one key", async () => {
    const requests: TransportRequest[] = [];
    const client = defineApi({
      baseURL: "https://x.dev",
      retry: { retries: 1, baseDelayMs: 0, jitter: false, methods: ["POST"] },
      transport: createFakeTransport((request) => {
        requests.push(request);
        return { status: 503, body: {} };
      }),
      resources: { users: { path: "/users", operations: { create: { idempotency: true } } } },
    });
    const { result } = renderHook(
      () =>
        useResourceMutation(client.users, {
          queryKey: ["users"],
          mutations: { create: { retry: 1, retryDelay: 0 } },
        }),
      { wrapper: wrap(newClient()) },
    );
    await act(async () => {
      await expect(result.current.create({ name: "Ada" })).rejects.toBeInstanceOf(HttpError);
    });
    await waitFor(() => expect(result.current.create.isError).toBe(true));
    const keys = requests.map((r) => r.headers.get("idempotency-key"));
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(1);
    expect(result.current.create.failureCount).toBe(2);
  });

  it("operations without idempotency never get a key", async () => {
    const { client, keys } = api([200]);
    const { result } = renderHook(
      () => useResourceMutation(client.users, { queryKey: ["users"] }),
      {
        wrapper: wrap(newClient()),
      },
    );
    await act(() => result.current.update("1", { body: { name: "x" } }));
    expect(keys()).toEqual([null]);
  });
});
