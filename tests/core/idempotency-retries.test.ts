import {
  ConfigError,
  defineApi,
  HttpError,
  NetworkError,
  type TransportRequest,
} from "@apixa/core";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type Step = number | "network-error" | "hang";

/** Records every outgoing attempt; each attempt takes the next scripted outcome. */
function script(steps: Step[]) {
  const attempts: TransportRequest[] = [];
  let i = 0;
  const transport = createFakeTransport(async (request) => {
    attempts.push(request);
    const step = steps[Math.min(i++, steps.length - 1)]!;
    if (step === "network-error") throw new TypeError("fetch failed");
    if (step === "hang") return new Promise<never>(() => undefined);
    return { status: step, body: step >= 400 ? { error: step } : { id: "1" } };
  });
  const keys = () => attempts.map((a) => a.headers.get("idempotency-key"));
  return { transport, attempts, keys };
}

const retry = { retries: 2, baseDelayMs: 0, jitter: false, methods: ["POST" as const] };
let counter = 0;
const sequential = () => `key-${++counter}`;

function api(steps: Step[], extra: Record<string, unknown> = {}) {
  const s = script(steps);
  counter = 0;
  const client = defineApi({
    baseURL: "https://x.dev",
    transport: s.transport,
    retry,
    ...extra,
    resources: {
      users: { path: "/users", operations: { create: { idempotency: { generate: sequential } } } },
    },
  });
  return { ...s, client };
}

describe("idempotency keys across Core retry paths", () => {
  it("one ordinary request: one key", async () => {
    const { client, keys } = api([200]);
    await client.users.create({ name: "Ada" });
    expect(keys()).toEqual(["key-1"]);
  });

  it("network-error retries reuse the key", async () => {
    const { client, keys } = api(["network-error", "network-error", 200]);
    await client.users.create({ name: "Ada" });
    expect(keys()).toEqual(["key-1", "key-1", "key-1"]);
  });

  it("exhausted retries: every attempt has the key, the call rejects, the next call gets a new one", async () => {
    const { client, keys } = api([503]);
    await expect(client.users.create({ name: "Ada" })).rejects.toBeInstanceOf(HttpError);
    expect(keys()).toEqual(["key-1", "key-1", "key-1"]);
    await expect(client.users.create({ name: "Ada" })).rejects.toBeInstanceOf(HttpError);
    expect(keys().slice(3)).toEqual(["key-2", "key-2", "key-2"]);
  });

  it("exhausted network errors reject with NetworkError and keep one key", async () => {
    const { client, keys } = api(["network-error"]);
    await expect(client.users.create({ name: "Ada" })).rejects.toBeInstanceOf(NetworkError);
    expect(new Set(keys())).toEqual(new Set(["key-1"]));
  });

  it("cancellation: the aborted attempt carried the key; a later call does not reuse it", async () => {
    const { client, keys } = api(["hang", 200]);
    const controller = new AbortController();
    const call = client.users.create({ name: "Ada" }, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(call).rejects.toThrow();
    await client.users.create({ name: "Ada" });
    expect(keys()).toEqual(["key-1", "key-2"]);
  });

  it("concurrent calls are isolated, even when their retries interleave", async () => {
    const { client, attempts } = api([503, 503, 200, 200]);
    await Promise.all([client.users.create({ name: "A" }), client.users.create({ name: "B" })]);
    const byBody = new Map<string, Set<string | null>>();
    for (const a of attempts) {
      const body = String(a.body);
      byBody.set(body, (byBody.get(body) ?? new Set()).add(a.headers.get("idempotency-key")));
    }
    expect([...byBody.values()].map((set) => set.size)).toEqual([1, 1]);
    const [a, b] = [...byBody.values()].map((set) => [...set][0]);
    expect(a).not.toBe(b);
  });
});

describe("idempotency keys and middleware", () => {
  it("middleware that adds headers keeps the key", async () => {
    const { client, attempts } = api([200], {
      middleware: {
        onRequest: (request: { headers: Headers }) => {
          request.headers.set("x-trace", "t-1");
        },
      },
    });
    await client.users.create({ name: "Ada" });
    expect(attempts[0]!.headers.get("x-trace")).toBe("t-1");
    expect(attempts[0]!.headers.get("idempotency-key")).toBe("key-1");
  });

  it("an auth refresh replay sends the new token with the same key", async () => {
    let token = "old";
    const { client, attempts } = api([401, 200], {
      middleware: {
        onRequest: (request: { headers: Headers }) => {
          request.headers.set("authorization", `Bearer ${token}`);
        },
        onError: (error: unknown, context: { replay?: () => Promise<unknown> }) => {
          if (error instanceof HttpError && error.status === 401 && context.replay) {
            token = "new";
            return context.replay();
          }
          return undefined;
        },
      },
    });
    await client.users.create({ name: "Ada" });
    expect(attempts.map((a) => a.headers.get("authorization"))).toEqual([
      "Bearer old",
      "Bearer new",
    ]);
    expect(attempts.map((a) => a.headers.get("idempotency-key"))).toEqual(["key-1", "key-1"]);
  });

  it("middleware that throws rejects the call; the next call gets a fresh key", async () => {
    let fail = true;
    const { client, keys } = api([200], {
      middleware: {
        onRequest: () => {
          if (fail) {
            fail = false;
            throw new Error("blocked");
          }
        },
      },
    });
    await expect(client.users.create({ name: "Ada" })).rejects.toThrow("blocked");
    await client.users.create({ name: "Ada" });
    expect(keys()).toEqual(["key-2"]);
  });
});

describe("function operations (documented limitation)", () => {
  it("reject the idempotency option instead of silently ignoring it", () => {
    expect(() =>
      defineApi({
        baseURL: "https://x.dev",
        resources: {
          users: {
            path: "/users",
            operations: {
              archive: {
                kind: "write",
                run: (ctx: { request: (o: object) => Promise<unknown> }) =>
                  ctx.request({ method: "POST" }),
                idempotency: true,
              } as never,
            },
          },
        },
      }),
    ).toThrow(ConfigError);
  });

  it("set the header themselves through ctx.request", async () => {
    const { transport, keys } = script([200]);
    const client = defineApi({
      baseURL: "https://x.dev",
      transport,
      resources: {
        users: {
          path: "/users",
          operations: {
            archive: {
              kind: "write",
              run: (ctx, id: string, key: string) =>
                ctx.request({
                  method: "POST",
                  path: `/${id}/archive`,
                  headers: { "Idempotency-Key": key },
                }),
            },
          },
        },
      },
    });
    await client.users.archive("1", "manual-key");
    expect(keys()).toEqual(["manual-key"]);
  });
});
