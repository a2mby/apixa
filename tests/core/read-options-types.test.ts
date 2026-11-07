import { defineApi } from "@apixa/core";
import { describe, expect, it } from "vitest";

const api = defineApi({
  baseURL: "https://x.dev",
  resources: { users: { path: "/users", mock: [{ id: "1", tenant: "t1" }] } },
});

describe("read options are typed: filters live under `query`", () => {
  it("rejects a misspelled or flat filter key at compile time", async () => {
    // @ts-expect-error `tenat` is not a request option (filters go under `query`)
    const flat = api.users.getAll({ tenat: "t1" });
    // @ts-expect-error a flat filter is not a request option either
    void api.users.getAll({ tenant: "t1" });
    // Valid: the same filter under `query`.
    expect(await api.users.getAll({ query: { tenant: "t1" } })).toHaveLength(1);
    // Runtime (plain JavaScript) ignores unknown keys; this is documented, not validated.
    expect(await flat).toHaveLength(1);
  });
});
