/** @vitest-environment jsdom */
import type { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OptimisticLayers } from "../../packages/react/src/optimistic.js";
import { createResourceQueryOptions } from "../../packages/react/src/query-options.js";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { deferred, newClient, wrap } from "../helpers/query.js";

type User = { id: string; name: string; role: string };

/**
 * A backend where every read and write waits for the test. A read answers with the server state
 * at the moment it was *sent* (what a real stale response is); a write changes the server only
 * when it succeeds. Neither honours abort signals, so this is the non-abortable transport case.
 */
function backend() {
  const server = new Map<string, User>([
    ["1", { id: "1", name: "Ada", role: "dev" }],
    ["2", { id: "2", name: "Grace", role: "dev" }],
  ]);
  const reads: Array<{ id: string; release: () => Promise<void> }> = [];
  const writes: Array<{ ok: () => Promise<void>; fail: () => Promise<void> }> = [];
  let autoRead = true;
  const read = (id: string): Promise<User> => {
    const snapshot = { ...server.get(id)! };
    if (autoRead) return Promise.resolve(snapshot);
    const gate = deferred<void>();
    const result = gate.promise.then(() => snapshot);
    reads.push({
      id,
      release: async () => {
        gate.resolve();
        await result;
      },
    });
    return result;
  };
  const write = (apply: () => User | undefined) => {
    const gate = deferred<void>();
    const result = gate.promise.then(apply);
    result.catch(() => undefined);
    writes.push({
      ok: async () => {
        gate.resolve();
        await result.catch(() => undefined);
      },
      fail: async () => {
        gate.reject(new Error("write failed"));
        await result.catch(() => undefined);
      },
    });
    return result;
  };
  const resource = {
    getAll: vi.fn(async () => [...server.values()]),
    getById: vi.fn(read),
    update: vi.fn((id: string, body: Partial<User>) =>
      write(() => {
        server.set(id, { ...server.get(id)!, ...body });
        return { ...server.get(id)! };
      }),
    ),
  };
  return {
    server,
    reads,
    writes,
    resource,
    hold: () => {
      autoRead = false;
    },
  };
}

type Backend = ReturnType<typeof backend>;
const KEY = ["users", "detail", "1"] as const;
const detailOptions = (resource: Backend["resource"], id = "1") =>
  createResourceQueryOptions(resource, { queryKey: ["users"], operation: "getById", args: [id] });
const detail = (client: QueryClient, id = "1") =>
  client.getQueryData<User>(["users", "detail", id]);
const layers = (client: QueryClient) => OptimisticLayers.for(client).size;

type Invalidate = false | "all" | "lists";

function setup(options: { invalidate?: Invalidate; optimistic?: boolean; observe?: boolean }) {
  const b = backend();
  const client = newClient();
  const writesHook = renderHook(
    () =>
      useResourceMutation(b.resource, {
        queryKey: ["users"],
        mutations: {
          update: {
            invalidate: options.invalidate ?? false,
            ...(options.optimistic === false
              ? {}
              : {
                  optimistic: {
                    detail: ([id]: [string, Partial<User>]) => id,
                    update: (current: User, [, changes]: [string, Partial<User>]) => ({
                      ...current,
                      ...changes,
                    }),
                  },
                }),
          },
        },
      }),
    { wrapper: wrap(client) },
  );
  const observer = options.observe
    ? renderHook(
        () =>
          useResourceQuery(b.resource, { queryKey: ["users"], operation: "getById", args: ["1"] }),
        { wrapper: wrap(client) },
      )
    : undefined;
  return { ...b, client, writesHook, observer };
}

async function seed(s: ReturnType<typeof setup>) {
  await s.client.fetchQuery(detailOptions(s.resource, "1"));
  await s.client.fetchQuery(detailOptions(s.resource, "2"));
  if (s.observer) await waitFor(() => expect(s.observer!.result.current.isSuccess).toBe(true));
  s.hold();
}

async function update(s: ReturnType<typeof setup>, id: string, changes: Partial<User>) {
  let call!: Promise<unknown>;
  await act(async () => {
    call = s.writesHook.result.current.update(id, changes);
    call.catch(() => undefined);
    await Promise.resolve();
  });
  await waitFor(() => expect(s.writes.length).toBeGreaterThan(0));
  return [call] as const;
}

/** Start a refetch of the detail entry (window focus, interval, manual refetch…). */
async function refetch(s: ReturnType<typeof setup>, id = "1") {
  await act(async () => {
    void s.client.refetchQueries({ queryKey: ["users", "detail", id], exact: true });
    await Promise.resolve();
  });
}

/** Release every held read in order, letting each settle. */
async function releaseAll(s: ReturnType<typeof setup>) {
  for (let i = 0; i < 10 && s.reads.some((r) => r); i++) {
    const pending = s.reads.splice(0);
    for (const r of pending) await act(() => r.release());
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("stale refetches around optimistic mutations", () => {
  for (const invalidate of [false, "lists", "all"] as const) {
    it(`a refetch sent before success and landing after it does not restore old data (invalidate: ${String(invalidate)})`, async () => {
      const s = setup({ invalidate, observe: invalidate === "all" });
      await seed(s);
      await update(s, "1", { name: "B" });
      await refetch(s); // sent while the server still has "Ada"
      expect(s.reads).toHaveLength(1);
      const stale = s.reads.shift()!;
      await act(() => s.writes[0]!.ok()); // server now has "B"
      expect(detail(s.client)?.name).toBe("B");
      await act(() => stale.release()); // the stale "Ada" response lands
      expect(detail(s.client)?.name).toBe("B");
      await releaseAll(s); // whatever fresh read Apixa or TanStack started
      expect(detail(s.client)).toEqual({ id: "1", name: "B", role: "dev" });
      expect(s.client.getQueryState(KEY)?.fetchStatus).toBe("idle");
      expect(layers(s.client)).toBe(0);
    });
  }

  it("a refetch that lands before success keeps the pending change on top", async () => {
    const s = setup({});
    await seed(s);
    await update(s, "1", { name: "B" });
    await refetch(s);
    await act(() => s.reads.shift()!.release());
    expect(detail(s.client)?.name).toBe("B");
    await act(() => s.writes[0]!.ok());
    expect(detail(s.client)?.name).toBe("B");
    expect(s.resource.getById).toHaveBeenCalledTimes(3); // seed ×2 + the one refetch; no extra
    expect(layers(s.client)).toBe(0);
  });

  it("a refetch landing after a failure shows server truth and starts no extra fetch", async () => {
    const s = setup({});
    await seed(s);
    await update(s, "1", { name: "B" });
    await refetch(s);
    await act(() => s.writes[0]!.fail());
    expect(detail(s.client)?.name).toBe("Ada");
    await act(() => s.reads.shift()!.release());
    expect(detail(s.client)?.name).toBe("Ada");
    expect(s.reads).toHaveLength(0);
    expect(s.resource.getById).toHaveBeenCalledTimes(3);
  });

  it("two mutations finishing out of order with a stale refetch in flight end at server truth", async () => {
    const s = setup({});
    await seed(s);
    await update(s, "1", { name: "A2" });
    await update(s, "1", { role: "B2" });
    await refetch(s);
    const stale = s.reads.shift()!;
    await act(() => s.writes[1]!.ok());
    await act(() => s.writes[0]!.ok());
    await act(() => stale.release());
    expect(detail(s.client)).toEqual({ id: "1", name: "A2", role: "B2" });
    await releaseAll(s);
    expect(detail(s.client)).toEqual({ id: "1", name: "A2", role: "B2" });
    expect(layers(s.client)).toBe(0);
  });

  for (const order of ["A fails after B succeeds", "B fails after A succeeds"] as const) {
    it(`${order}, with a stale refetch in flight: the success survives`, async () => {
      const s = setup({});
      await seed(s);
      await update(s, "1", { name: "A" });
      await update(s, "1", { role: "B" });
      await refetch(s);
      const stale = s.reads.shift()!;
      const [first, second] = order === "A fails after B succeeds" ? [1, 0] : [0, 1];
      await act(() => s.writes[first]!.ok());
      await act(() => s.writes[second]!.fail());
      await act(() => stale.release());
      await releaseAll(s);
      expect(detail(s.client)).toEqual({ ...s.server.get("1") });
      expect(detail(s.client)).toEqual(
        order === "A fails after B succeeds"
          ? { id: "1", name: "Ada", role: "B" }
          : { id: "1", name: "A", role: "dev" },
      );
      expect(layers(s.client)).toBe(0);
    });
  }

  it("a manual invalidation during the mutation still ends at the confirmed data", async () => {
    const s = setup({ observe: true });
    await seed(s);
    await update(s, "1", { name: "B" });
    await act(async () => {
      void s.client.invalidateQueries({ queryKey: ["users"] });
      await Promise.resolve();
    });
    const stale = s.reads.shift()!;
    await act(() => s.writes[0]!.ok());
    await act(() => stale.release());
    expect(detail(s.client)?.name).toBe("B");
    await releaseAll(s);
    expect(detail(s.client)?.name).toBe("B");
  });

  it("an explicit cancellation during the mutation keeps the change and leaves nothing behind", async () => {
    const s = setup({});
    await seed(s);
    await update(s, "1", { name: "B" });
    await refetch(s);
    await act(() => s.client.cancelQueries({ queryKey: KEY }));
    await act(() => s.writes[0]!.ok());
    await releaseAll(s);
    expect(detail(s.client)?.name).toBe("B");
    expect(s.client.getQueryState(KEY)?.fetchStatus).toBe("idle");
    expect(layers(s.client)).toBe(0);
  });

  it("an unmounted writer still protects confirmed data from a stale response", async () => {
    const s = setup({});
    await seed(s);
    const [call] = await update(s, "1", { name: "B" });
    await refetch(s);
    const stale = s.reads.shift()!;
    s.writesHook.unmount();
    await act(() => s.writes[0]!.ok());
    await call;
    await act(() => stale.release());
    await releaseAll(s);
    expect(detail(s.client)?.name).toBe("B");
  });
});

describe("stale fetches of inactive entries during invalidation", () => {
  it("an in-flight prefetch sent before success cannot mark old data fresh", async () => {
    const s = setup({ invalidate: "all", optimistic: false });
    await seed(s);
    // A hover prefetch (no observer) is in flight when the write succeeds.
    await act(async () => {
      void s.client.prefetchQuery(detailOptions(s.resource));
      await Promise.resolve();
    });
    const stale = s.reads.shift()!;
    await update(s, "1", { name: "B" });
    await act(() => s.writes[0]!.ok());
    await act(() => stale.release());
    await releaseAll(s);
    expect(detail(s.client)?.name).toBe("B");
  });

  it("idle inactive entries are only marked invalid (native behaviour, no refetch)", async () => {
    const s = setup({ invalidate: "all", optimistic: false });
    await seed(s);
    await update(s, "1", { name: "B" });
    await act(() => s.writes[0]!.ok());
    expect(s.reads).toHaveLength(0);
    expect(s.client.getQueryState(KEY)?.isInvalidated).toBe(true);
  });
});

describe("manual cache writes during pending optimistic changes (takeover)", () => {
  async function pendingWith(count: 1 | 2) {
    const s = setup({});
    await seed(s);
    await update(s, "1", { name: "X" });
    if (count === 2) await update(s, "1", { role: "Y" });
    return s;
  }

  it("cache.set() and native setQueryData both take the entry over", async () => {
    for (const via of ["cache.set", "setQueryData"] as const) {
      const s = await pendingWith(1);
      const query = renderHook(
        () =>
          useResourceQuery(s.resource, { queryKey: ["users"], operation: "getById", args: ["1"] }),
        { wrapper: wrap(s.client) },
      );
      const manual = { id: "1", name: "Manual", role: "dev" };
      act(() => {
        if (via === "cache.set") query.result.current.cache.set(manual);
        else s.client.setQueryData(KEY, manual);
      });
      expect(layers(s.client)).toBe(0);
      await act(() => s.writes[0]!.fail());
      expect(detail(s.client)).toEqual(manual); // no rollback over the manual write
    }
  });

  it("then success: the manual value stays; invalidation would bring server truth", async () => {
    const s = await pendingWith(1);
    act(() => s.client.setQueryData<User>(KEY, (u) => ({ ...u!, role: "lead" })));
    await act(() => s.writes[0]!.ok());
    expect(detail(s.client)).toEqual({ id: "1", name: "X", role: "lead" });
  });

  it("a functional write derived from optimistic data keeps that residue after a failure", async () => {
    const s = await pendingWith(1);
    // Built on the visible (optimistic) value: name "X" becomes part of the manual write.
    act(() => s.client.setQueryData<User>(KEY, (u) => ({ ...u!, role: "lead" })));
    await act(() => s.writes[0]!.fail());
    expect(detail(s.client)).toEqual({ id: "1", name: "X", role: "lead" });
  });

  it("two pending changes, then a manual write: both are released for that entry only", async () => {
    const s = await pendingWith(2);
    await update(s, "2", { name: "Other" });
    expect(layers(s.client)).toBe(2);
    act(() => s.client.setQueryData(KEY, { id: "1", name: "M", role: "M" }));
    expect(layers(s.client)).toBe(1); // entry 2 still managed
    await act(() => s.writes[0]!.fail());
    await act(() => s.writes[1]!.fail());
    expect(detail(s.client)).toEqual({ id: "1", name: "M", role: "M" });
    await act(() => s.writes[2]!.fail());
    expect(detail(s.client, "2")?.name).toBe("Grace"); // unrelated entry rolled back normally
    expect(layers(s.client)).toBe(0);
  });

  it("removal during a pending change drops bookkeeping; the settle does not resurrect it", async () => {
    const s = await pendingWith(1);
    act(() => s.client.removeQueries({ queryKey: KEY }));
    expect(layers(s.client)).toBe(0);
    await act(() => s.writes[0]!.ok());
    expect(detail(s.client)).toBeUndefined();
  });

  it("invalidation after a manual write fetches server truth", async () => {
    const s = await pendingWith(1);
    act(() => s.client.setQueryData(KEY, { id: "1", name: "M", role: "dev" }));
    await act(() => s.writes[0]!.ok());
    await act(async () => {
      void s.client.refetchQueries({ queryKey: KEY });
      await Promise.resolve();
    });
    await releaseAll(s);
    expect(detail(s.client)).toEqual({ id: "1", name: "X", role: "dev" });
  });
});
