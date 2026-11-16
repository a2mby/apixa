import { ConfigError, SchemaValidationError, isStandardSchema, ValidationError } from "@apixa/core";
import type { StandardSchemaV1 } from "@apixa/core";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { prepareQuery, validateAsync, validateSync } from "../../packages/core/src/schema/index.js";

const site = { resource: "products", operation: "create", phase: "body" } as const;

/** A hand-written Standard Schema V1 validator: no library involved. */
function handmade<T>(
  check: (value: unknown) => { value: T } | { issues: { message: string; path?: PropertyKey[] }[] },
  async = false,
): StandardSchemaV1<unknown, T> {
  return {
    "~standard": {
      version: 1,
      vendor: "handmade",
      validate: (value: unknown) => {
        const result = check(value) as ReturnType<
          StandardSchemaV1<unknown, T>["~standard"]["validate"]
        >;
        return async ? Promise.resolve(result) : result;
      },
    },
  };
}

describe("Standard Schema detection", () => {
  it("accepts compliant validators from different libraries", () => {
    expect(isStandardSchema(z.string())).toBe(true);
    expect(isStandardSchema(v.string())).toBe(true);
    expect(isStandardSchema(handmade(() => ({ value: 1 })))).toBe(true);
  });

  it("recognizes validators by their `~standard` interface, not by `.parse()`", () => {
    expect(isStandardSchema({ parse: (x: unknown) => x })).toBe(false);
    expect(isStandardSchema({ safeParse: () => ({}) })).toBe(false);
  });

  it("rejects objects without the interface or a validate function", () => {
    expect(isStandardSchema(null)).toBe(false);
    expect(isStandardSchema(undefined)).toBe(false);
    expect(isStandardSchema("string")).toBe(false);
    expect(isStandardSchema({})).toBe(false);
    expect(isStandardSchema({ "~standard": null })).toBe(false);
    expect(isStandardSchema({ "~standard": { version: 1 } })).toBe(false);
    expect(isStandardSchema({ "~standard": { version: 2, validate: () => ({}) } })).toBe(false);
  });
});

describe("validateSync / validateAsync", () => {
  it("returns the parsed value, not the input (transformation, defaults)", async () => {
    const schema = z.object({ qty: z.coerce.number(), tag: z.string().default("new") });
    expect(validateSync(schema, { qty: "12" }, site)).toEqual({ qty: 12, tag: "new" });
    await expect(validateAsync(schema, { qty: "12" }, site)).resolves.toEqual({
      qty: 12,
      tag: "new",
    });
  });

  it("works across libraries", async () => {
    expect(validateSync(v.object({ n: v.number() }), { n: 1 }, site)).toEqual({ n: 1 });
    expect(
      await validateAsync(
        handmade(() => ({ value: 7 })),
        "x",
        site,
      ),
    ).toBe(7);
  });

  it("reports standardized issues with paths and messages", () => {
    const error = (() => {
      try {
        validateSync(z.object({ a: z.object({ b: z.number() }) }), { a: { b: "no" } }, site);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(SchemaValidationError);
    expect(error).toBeInstanceOf(ValidationError);
    const failure = error as SchemaValidationError;
    expect(failure).toMatchObject({
      phase: "body",
      resource: "products",
      operation: "create",
      code: "VALIDATION_ERROR",
      retryable: false,
    });
    expect(failure.issues[0]?.path).toEqual(["a", "b"]);
    expect(failure.issues[0]?.message).toEqual(expect.any(String));
    expect(failure.message).toContain("a.b");
    expect(failure.message).not.toContain('"no"');
  });

  it("uses the response phase for response failures", () => {
    expect(() =>
      validateSync(z.number(), "x", { resource: "a", operation: "b", phase: "response" }),
    ).toThrowError(expect.objectContaining({ phase: "response" }));
  });

  it("awaits asynchronous validators in validateAsync", async () => {
    const schema = z.string().refine(async (value) => value.length > 2, "too short");
    await expect(validateAsync(schema, "abc", site)).resolves.toBe("abc");
    await expect(validateAsync(schema, "a", site)).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it("rejects asynchronous validators deterministically in validateSync", async () => {
    const asyncSchema = handmade(() => ({ value: 1 }), true);
    expect(() => validateSync(asyncSchema, 1, { ...site, phase: "query" })).toThrowError(
      ConfigError,
    );
    expect(() => validateSync(asyncSchema, 1, { ...site, phase: "query" })).toThrowError(
      /query schemas must validate synchronously/,
    );
    // A rejected promise from the discarded result never becomes an unhandled rejection.
    const rejecting: StandardSchemaV1 = {
      "~standard": {
        version: 1,
        vendor: "t",
        validate: () => Promise.reject(new Error("late")),
      },
    };
    expect(() => validateSync(rejecting, 1, { ...site, phase: "query" })).toThrowError(ConfigError);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("keeps the original exception as `cause` when a validator throws", async () => {
    const boom = new TypeError("validator exploded");
    const schema = handmade(() => {
      throw boom;
    });
    const sync = (() => {
      try {
        validateSync(schema, 1, site);
      } catch (e) {
        return e as SchemaValidationError;
      }
    })();
    expect(sync).toBeInstanceOf(SchemaValidationError);
    expect(sync?.cause).toBe(boom);
    const asyncFailure = await validateAsync(schema, 1, site).catch((e: unknown) => e);
    expect((asyncFailure as SchemaValidationError).cause).toBe(boom);
  });

  it("treats malformed validator results as configuration errors, not mismatches", () => {
    const bad = { "~standard": { version: 1, vendor: "t", validate: () => "nope" } };
    expect(() => validateSync(bad as never, 1, site)).toThrowError(ConfigError);
    const badIssues = { "~standard": { version: 1, vendor: "t", validate: () => ({ issues: 3 }) } };
    expect(() => validateSync(badIssues as never, 1, site)).toThrowError(ConfigError);
  });
});

describe("prepareQuery", () => {
  const schema = z.object({ q: z.string(), limit: z.coerce.number().default(10) });
  const querySite = { resource: "products", operation: "search", phase: "query" } as const;

  it("returns parsed output and marks it prepared (never validated twice)", () => {
    let calls = 0;
    const counted = handmade((value) => {
      calls++;
      return { value: { ...(value as object), seen: true } };
    });
    const first = prepareQuery(counted, { q: "a" }, querySite);
    expect(first).toEqual({ q: "a", seen: true });
    expect(prepareQuery(counted, first, querySite)).toBe(first);
    expect(calls).toBe(1);
  });

  it("never trusts a query prepared for a different schema", () => {
    const loose = z.object({ a: z.coerce.number() });
    const strict = z.object({ a: z.number().max(5) });
    const prepared = prepareQuery(loose, { a: "9" }, querySite);
    expect(prepared).toEqual({ a: 9 });
    expect(() => prepareQuery(strict, prepared, querySite)).toThrowError(SchemaValidationError);
    expect(prepareQuery(loose, prepared, querySite)).toBe(prepared);
  });

  it("keeps SDK pagination controls out of the application schema", () => {
    expect(
      prepareQuery(schema, { q: "a", page: 2, pageSize: 5 }, querySite, ["page", "pageSize"]),
    ).toEqual({ q: "a", limit: 10, page: 2, pageSize: 5 });
  });

  it("requires an object (or nothing) as output", () => {
    expect(() => prepareQuery(z.string(), "x" as never, querySite)).toThrowError(ConfigError);
    expect(prepareQuery(z.undefined(), undefined, querySite)).toBeUndefined();
  });
});
