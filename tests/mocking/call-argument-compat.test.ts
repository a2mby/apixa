import "../../packages/mocking/src/register.js";
import { defineApi } from "@apixa/core";
import { defineMockApi } from "@apixa/mocking";
import { describe, expect, it } from "vitest";

const core = defineApi({
  baseURL: "https://x.dev",
  resources: { users: { path: "/users", mock: "users-mock" } },
}).users;
const mock = defineMockApi({ users: { type: "users-mock" } }).users;

describe("Mocking/Core argument compatibility: RequestOptions vs entity filters", () => {
  it("treats a plain object as an entity filter in Mocking and as options.query in Core", async () => {
    expect(await mock.getAll({ companyId: "1" } as never)).toEqual(
      await core.getAll({ query: { companyId: "1" } }),
    );
  });

  it("treats request-option keys as options, not filters", async () => {
    const signal = new AbortController().signal;
    expect(await mock.getAll({ signal } as never)).toEqual(await core.getAll({ signal }));
    expect((await mock.getAll({ signal } as never)).length).toBeGreaterThan(0);
  });

  it("splits a mixed object: option keys stay options, the rest filter rows", async () => {
    const signal = new AbortController().signal;
    const mixed = await mock.getAll({ signal, companyId: "1" } as never);
    expect(mixed).toEqual(await core.getAll({ signal, query: { companyId: "1" } }));
    expect(mixed.length).toBeGreaterThan(0);
    expect(mixed.length).toBeLessThan((await mock.getAll()).length);
  });

  it("an explicit options.query wins over a colliding loose filter", async () => {
    const result = await mock.getAll({ query: { companyId: "1" }, companyId: "2" } as never);
    expect(result).toEqual(await core.getAll({ query: { companyId: "1" } }));
  });

  it("rejects an already-aborted signal in both, instead of returning data", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(core.getAll({ signal: ac.signal })).rejects.toBeDefined();
    await expect(mock.getAll({ signal: ac.signal } as never)).rejects.toBeDefined();
  });
});
