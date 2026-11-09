import {
  defineApi,
  type FileFieldOptions,
  type FileLimits,
  type FileRules,
  type FileViolation,
  type FileViolationCode,
  ValidationError,
} from "@apixa/core";
import { describe, expectTypeOf, it } from "vitest";

/** v1.4.0 compile-time contract. Calls live in never-invoked functions. */
type IsAny<T> = 0 extends 1 & T ? true : false;
type Pet = { id: string; name: string; photo?: string | null; docs?: string[] | null; age: number };
type AppApi = { pets: { path: "/pets"; entity: Pet } };
const baseURL = "https://api.example.com";

const client = () =>
  defineApi<AppApi>()({
    baseURL,
    resources: {
      pets: {
        path: "/pets",
        fileFields: {
          photo: {
            name: "avatar",
            maxSize: 5,
            accept: ["image/*", ".heic"],
            unknownType: "allow",
            filename: "strict",
          },
          docs: { min: 1, max: 3, minSize: 1, reject: [".exe"], noExtension: "reject" },
        },
        fileLimits: { maxTotalSize: 10, maxFiles: 4, maxBodySize: 8 },
        operations: {
          create: { fileFields: { photo: { maxSize: 1 } }, fileLimits: { maxFiles: 1 } },
          export: {
            kind: "read",
            method: "GET",
            path: "/export",
            responseType: "blob",
            maxResponseSize: 100,
            responseAccept: ["application/pdf"],
          },
          upload: {
            kind: "write",
            method: "POST",
            path: "/upload",
            fileLimits: { maxBodySize: 1 },
          },
        },
      },
    },
  });

describe("v1.4.0 types", () => {
  it("accepts the documented configuration and keeps existing fileFields forms", () => {
    const run = () => {
      defineApi<AppApi>()({
        baseURL,
        resources: { pets: { path: "/pets", fileFields: ["photo", "docs"] } },
      });
      defineApi<AppApi>()({
        baseURL,
        resources: { pets: { path: "/pets", fileFields: { photo: { name: "avatar" } } } },
      });
      client();
    };
    void run;
  });

  it("rejects misspelled or mistyped rules and unknown fields", () => {
    const run = () => {
      defineApi<AppApi>()({
        baseURL,
        // @ts-expect-error unknown rule
        resources: { pets: { path: "/pets", fileFields: { photo: { maxSizeBytes: 1 } } } },
      });
      defineApi<AppApi>()({
        baseURL,
        // @ts-expect-error sizes are numbers
        resources: { pets: { path: "/pets", fileFields: { photo: { maxSize: "5MB" } } } },
      });
      defineApi<AppApi>()({
        baseURL,
        // @ts-expect-error unknownType is "allow" | "reject"
        resources: { pets: { path: "/pets", fileFields: { photo: { unknownType: "maybe" } } } },
      });
      defineApi<AppApi>()({
        baseURL,
        // @ts-expect-error `age` is a number field, not a file field
        resources: { pets: { path: "/pets", fileFields: { age: { maxSize: 1 } } } },
      });
      defineApi<AppApi>()({
        baseURL,
        // @ts-expect-error unknown fileLimits key
        resources: { pets: { path: "/pets", fileLimits: { maxEverything: 1 } } },
      });
    };
    void run;
  });

  it("exports the rule and violation types", () => {
    expectTypeOf<FileFieldOptions>().toMatchTypeOf<FileRules>();
    expectTypeOf<FileLimits["maxTotalSize"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<FileRules["accept"]>().toEqualTypeOf<readonly string[] | undefined>();
    expectTypeOf<FileViolation["code"]>().toEqualTypeOf<FileViolationCode>();
    expectTypeOf<ValidationError["violations"]>().toEqualTypeOf<readonly FileViolation[]>();
    expectTypeOf<"FILE_TOO_LARGE">().toMatchTypeOf<FileViolationCode>();
    // @ts-expect-error not a violation code
    expectTypeOf<"SOMETHING_ELSE">().toMatchTypeOf<FileViolationCode>();
  });

  it("narrows a caught ValidationError and keeps result inference unchanged", () => {
    const run = async () => {
      const api = client();
      try {
        const created = await api.pets.create({ name: "x", age: 1, photo: new File([], "a.png") });
        expectTypeOf(created).toEqualTypeOf<Pet>();
        expectTypeOf<IsAny<typeof created>>().toEqualTypeOf<false>();
      } catch (error) {
        if (error instanceof ValidationError) {
          const first = error.violations[0];
          if (first?.code === "FILE_TOO_LARGE") expectTypeOf(first.path).toEqualTypeOf<string>();
        }
      }
      const blob = await api.pets.export({ maxResponseSize: 5 });
      expectTypeOf(blob).toEqualTypeOf<Blob>();
      const full = await api.pets.export({ full: true, maxResponseSize: 5 });
      expectTypeOf(full.data).toEqualTypeOf<Blob>();
      // @ts-expect-error maxResponseSize is a number
      void api.pets.export({ maxResponseSize: "5" });
    };
    void run;
  });

  it("ctx.request accepts maxResponseSize and keeps its typing", () => {
    const run = () =>
      defineApi<AppApi>()({
        baseURL,
        resources: {
          pets: {
            path: "/pets",
            operations: {
              archive: {
                kind: "read",
                run: async (ctx) => {
                  const blob = await ctx.request({
                    path: "/x",
                    responseType: "blob",
                    maxResponseSize: 5,
                  });
                  expectTypeOf(blob).toEqualTypeOf<Blob>();
                  return blob;
                },
              },
            },
          },
        },
      });
    void run;
  });
});
