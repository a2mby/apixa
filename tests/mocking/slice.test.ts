import "../../packages/mocking/src/register.js";
import { describe, expect, it } from "vitest";
import { defineApi } from "@apixa/core";
import { defineMockApi, InvalidSliceError, MockingErrors } from "@apixa/mocking";
import { type User } from "@apixa/mocking/data";

describe("mock slice", () => {
  it("slice: number takes the first N and clamps when N exceeds the dataset", async () => {
    const api = defineMockApi({
      few: { type: "products-mock", slice: 5 },
      all: { type: "products-mock", slice: 10_000 },
    });
    expect(await api.few.getAll()).toHaveLength(5);
    expect(await api.all.getAll()).toHaveLength(100);
  });

  it("slice: { start, end } uses a half-open window", async () => {
    const api = defineMockApi({
      mid: { type: "products-mock", slice: { start: 2, end: 5 } },
    });
    const rows = await api.mid.getAll();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.id)).toEqual(["3", "4", "5"]);
  });

  it("slice: { start, end } follows Array.slice when end exceeds length (shared seed semantics)", async () => {
    const api = defineMockApi({
      overshoot: { type: "products-mock", slice: { start: 10, end: 10_000 } },
    });
    expect(await api.overshoot.getAll()).toHaveLength(90);
  });

  it("rejects end before start with InvalidSliceError when the API is built", () => {
    const build = () =>
      defineMockApi({ bad: { type: "products-mock", slice: { start: 10, end: 3 } } });
    expect(build).toThrow(InvalidSliceError);
    expect(build).toThrow(MockingErrors);
    expect(build).toThrow(/end \(3\).*before.*start \(10\)/);
  });

  it("rejects negative slice values", () => {
    expect(() => defineMockApi({ a: { type: "products-mock", slice: -1 } })).toThrow(
      InvalidSliceError,
    );
    expect(() =>
      defineMockApi({ a: { type: "products-mock", slice: { start: -1, end: 2 } } }),
    ).toThrow(InvalidSliceError);
    expect(() =>
      defineMockApi({ a: { type: "products-mock", slice: { start: 0, end: -2 } } }),
    ).toThrow(InvalidSliceError);
  });

  it("defineApi users-mock + slice: 100 yields 100 users", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        users: {
          path: "/users",
          mock: "users-mock",
          slice: 100,
        },
      },
    });
    const users = (await api.users.getAll()) as User[];
    expect(users).toHaveLength(100);
    expect(users[0]).toMatchObject({ id: "1", username: expect.any(String) });
  });
});
