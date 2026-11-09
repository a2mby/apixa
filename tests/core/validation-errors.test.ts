import { ApiError, ValidationError, defineApi, isApiError } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { file, petApi, rejection } from "../helpers/validation.js";

describe("ValidationError for files", () => {
  const trigger = async (resource: Record<string, unknown>, body: unknown) => {
    const { api } = petApi("live", { resource });
    return (await rejection(api.pets.create(body))) as ValidationError;
  };

  it("keeps its class, name, code and retryable flag", async () => {
    const error = await trigger({ fileFields: { photo: { maxSize: 1 } } }, { photo: file(5) });
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toBeInstanceOf(ApiError);
    expect(isApiError(error)).toBe(true);
    expect(error.name).toBe("ValidationError");
    expect(error.code).toBe("VALIDATION");
    expect(error.retryable).toBe(false);
    expect(error.request?.method).toBe("POST");
  });

  it("lists codes and locations in the message, never values", async () => {
    const error = await trigger({ fileFields: { photo: { maxSize: 1 } } }, { photo: file(5) });
    expect(error.message).toBe("File validation failed (1 violation): FILE_TOO_LARGE at $.photo");
  });

  it("caps violations at 20 and says more existed", async () => {
    const error = await trigger(
      { fileFields: { photo: {}, docs: { maxSize: 1 } } },
      { docs: Array.from({ length: 30 }, () => file(5)) },
    );
    expect(error.violations).toHaveLength(20);
    expect(error.message).toMatch(/\(20\+ violations\)/);
  });

  it("violations are immutable data with only code, path, limit, actual and rule", async () => {
    const error = await trigger(
      { fileFields: { photo: { maxSize: 1, accept: ["image/*"] } } },
      { photo: file(5, "x.pdf", "application/pdf") },
    );
    for (const v of error.violations) {
      expect(
        Object.keys(v).every((k) => ["code", "path", "limit", "actual", "rule"].includes(k)),
      ).toBe(true);
    }
    expect(Object.isFrozen(error.violations)).toBe(true);
  });

  it("never exposes file names, types or contents anywhere (marker test)", async () => {
    const marker = "ZX-SECRET-MARKER-91";
    const secret = new File([`${marker}-bytes`], `${marker}-name.exe`, {
      type: `application/${marker}`,
    });
    const error = await trigger(
      {
        fileFields: {
          photo: { maxSize: 1, accept: ["image/*"], filename: "strict", reject: [".exe"] },
        },
        fileLimits: { maxTotalSize: 1 },
      },
      { photo: secret },
    );
    const everything = [
      error.message,
      JSON.stringify(error.violations),
      JSON.stringify(
        error,
        Object.getOwnPropertyNames(error).filter((k) => k !== "request" && k !== "stack"),
      ),
      String(error.stack).split("\n")[0],
    ].join("\n");
    expect(everything).not.toContain(marker);
    expect(error.violations.length).toBeGreaterThan(2);
  });

  it("a request-path file key built from caller data is only a body key, not a name", async () => {
    const error = await trigger(
      { fileFields: { photo: {} }, fileLimits: { maxFiles: 0 } },
      { photo: file(1, "name-with-secret.png") },
    );
    expect(error.violations[0]).toMatchObject({ code: "TOO_MANY_FILES", path: "$" });
  });

  it("the existing path-parameter ValidationError is unchanged", async () => {
    const api = defineApi<{ pets: { path: "/pets"; entity: { id: string } } }>()({
      baseURL: "https://api.example.com",
      resources: {
        pets: {
          path: "/pets",
          operations: { open: { kind: "read", method: "GET", path: "/:id/open" } },
        },
      },
    } as never) as never as { pets: { open(): Promise<unknown> } };
    const error = (await rejection(api.pets.open())) as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toMatch(/Missing path parameter "id"/);
    expect(error.violations).toEqual([]);
    expect(new ValidationError().message).toBe("Response validation failed");
  });
});
