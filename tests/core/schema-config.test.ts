import { ConfigError, defineApi } from "@apixa/core";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { z } from "zod";

function build(operations: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return () =>
    defineApi({
      baseURL: "https://api.example.com",
      resources: { products: { path: "/products", ...extra, operations: operations as never } },
    } as never);
}

const message = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as Error).message;
  }
  throw new Error("expected a ConfigError");
};

describe("schema configuration is validated at defineApi()", () => {
  it("accepts Standard Schema validators from any library", () => {
    expect(
      build({
        create: { schema: { body: z.object({ a: z.string() }) } },
        getAll: { schema: { query: v.object({ a: v.string() }), response: z.array(z.string()) } },
      }),
    ).not.toThrow();
  });

  it("names the resource, operation and option for an invalid validator", () => {
    const text = message(build({ create: { schema: { body: { parse: () => 1 } } } }));
    expect(text).toContain("resources.products.operations.create.schema.body");
    expect(text).toContain("Expected a Standard Schema V1-compatible validator.");
  });

  it("rejects a bare schema (no method-dependent shorthand)", () => {
    expect(message(build({ create: { schema: z.object({}) } }))).toMatch(/schema/);
    expect(message(build({ getById: { schema: z.string() } }))).toContain("bare schema");
  });

  it("rejects unknown keys, empty objects and non-object containers", () => {
    expect(message(build({ create: { schema: { bodyy: z.string() } } }))).toContain(
      'unknown option "bodyy"',
    );
    expect(message(build({ create: { schema: {} } }))).toContain("at least one");
    expect(message(build({ create: { schema: null } }))).toContain("Expected an object");
    expect(message(build({ create: { schema: [] } }))).toContain("Expected an object");
    expect(message(build({ create: { schema: "x" } }))).toContain("Expected an object");
  });

  it("rejects an invalid validator inside an otherwise valid schema object", () => {
    expect(message(build({ create: { schema: { body: z.string(), response: 5 } } }))).toContain(
      "schema.response: Expected a Standard Schema V1-compatible validator.",
    );
  });

  it("does not execute validators to validate the configuration", () => {
    let calls = 0;
    const schema = {
      "~standard": {
        version: 1,
        vendor: "t",
        validate: () => {
          calls++;
          return { value: 1 };
        },
      },
    };
    build({ create: { schema: { body: schema, query: schema, response: schema } } })();
    expect(calls).toBe(0);
  });

  it("rejects a body schema where no body is sent", () => {
    expect(message(build({ getAll: { schema: { body: z.object({}) } } }))).toContain(
      "no request body",
    );
    expect(message(build({ delete: { schema: { body: z.object({}) } } }))).toContain(
      "no request body",
    );
    expect(
      message(build({ find: { method: "GET", path: "/f", schema: { body: z.object({}) } } })),
    ).toContain("no request body");
    // hasBody: true makes it explicit, so the body schema is honored.
    expect(
      build({ find: { method: "GET", path: "/f", hasBody: true, schema: { body: z.object({}) } } }),
    ).not.toThrow();
  });

  it("composes response.parse and response schemas at all layers", () => {
    const parse = (data: unknown) => data;
    expect(
      build({ getById: { response: { parse }, schema: { response: z.object({}) } } }),
    ).not.toThrow();
    expect(
      build({ getById: { schema: { response: z.object({}) } } }, { response: { parse } }),
    ).not.toThrow();
    expect(() =>
      defineApi({
        baseURL: "https://api.example.com",
        response: { parse },
        resources: {
          products: { path: "/p", operations: { getById: { schema: { response: z.object({}) } } } },
        },
      }),
    ).not.toThrow();
  });

  it("honors parse: false at any level as 'no effective parser'", () => {
    const parse = (data: unknown) => data;
    expect(
      defineApi({
        baseURL: "https://api.example.com",
        response: { parse },
        resources: {
          products: {
            path: "/p",
            operations: {
              getById: { response: { parse: false }, schema: { response: z.string() } },
            },
          },
        },
      }),
    ).toBeDefined();
    expect(
      build({ getById: { schema: { response: z.string() } } }, { response: { parse: false } }),
    ).not.toThrow();
  });

  it("rejects schemas on run operations", () => {
    expect(
      message(
        build({
          custom: { kind: "read", run: async () => 1, schema: { response: z.number() } },
        }),
      ),
    ).toContain("executes your function");
  });
});
