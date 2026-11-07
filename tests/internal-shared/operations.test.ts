import { describe, expect, it } from "vitest";
import { defineApi } from "@apixa/core";
import {
  assertNoFullResponse,
  BUILTIN_READ_NAMES,
  describeOperations,
  isPlainObject,
} from "@apixa/internal-shared";
import { describeOperations as describeFromReact } from "../../packages/react/src/advanced";
import { createFakeTransport } from "../helpers/fake-transport";

describe("shared operation classification", () => {
  it("classifies Core clients from Core metadata, not names", () => {
    const api = defineApi({
      baseURL: "https://example.test",
      transport: createFakeTransport(() => ({ body: [] })),
      resources: {
        users: {
          path: "/users",
          operations: {
            fetchAll: { kind: "read", method: "GET", path: "/all" },
            archive: { kind: "write", method: "POST", path: "/archive" },
          },
        },
      },
    });
    const table = describeOperations(api.users);
    expect(table.get("getAll")).toMatchObject({ kind: "read", builtin: true });
    expect(table.get("create")).toMatchObject({ kind: "write", builtin: true });
    expect(table.get("fetchAll")).toMatchObject({ kind: "read", builtin: false });
    expect(table.get("archive")).toMatchObject({ kind: "write", builtin: false });
    expect(describeOperations(api.users)).toBe(table);
  });

  it("falls back to Core's builtin table for plain objects", () => {
    const table = describeOperations({ getAll: () => 1, custom: () => 2, notAFunction: 3 });
    expect(table.get("getAll")).toMatchObject({ kind: "read", builtin: true, optionsIndex: null });
    expect(table.get("custom")).toMatchObject({ kind: "write", builtin: false });
    expect(table.has("notAFunction")).toBe(false);
    expect(BUILTIN_READ_NAMES.has("getAll")).toBe(true);
    expect(BUILTIN_READ_NAMES.has("create")).toBe(false);
  });

  it("rejects full responses only at the options position", () => {
    const info = { kind: "read", builtin: true, optionsIndex: 1, idempotency: false } as const;
    expect(() => assertNoFullResponse(["1", { full: true }], info)).toThrow(/full: true/);
    expect(() => assertNoFullResponse(["1", { full: false }], info)).not.toThrow();
    expect(() =>
      assertNoFullResponse([{ full: true }], { ...info, optionsIndex: null }),
    ).not.toThrow();
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject([])).toBe(false);
  });

  it("is the same implementation the React package exposes", () => {
    expect(describeFromReact).toBe(describeOperations);
  });
});
