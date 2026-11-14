import { AbortError } from "@apixa/core";
import { defineApi } from "@apixa/core";
import { createFakeTransport } from "../helpers/fake-transport.js";

const api = defineApi({
  baseURL: "https://example.test",
  timeout: 10000,
  retry: { retries: 2, baseDelayMs: 1, jitter: false },
  transport: createFakeTransport(() => ({ body: [{ id: "1" }] })),
  resources: { users: { path: "/users" } },
});
import { describe, expect, it } from "vitest";

describe("configured API reliability", () => {
  it("loads mocked users through timeout + retry + middleware config", async () => {
    const users = await api.users.getAll();
    expect(Array.isArray(users)).toBe(true);
    expect((users as { length: number }).length).toBeGreaterThan(0);
  });

  it("honors AbortSignal on getAll", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(api.users.getAll({ signal: controller.signal })).rejects.toBeInstanceOf(
      AbortError,
    );
  });

  it("accepts per-call timeout override", async () => {
    const users = await api.users.getAll({ timeout: 5_000 });
    expect(Array.isArray(users)).toBe(true);
  });
});
