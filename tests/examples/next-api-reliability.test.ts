import { AbortError } from "@apixa/core";
import { api } from "../../examples/next/lib/api";
import { describe, expect, it } from "vitest";

describe("examples/next lib/api reliability", () => {
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
