import { ValidationError } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { file, petApi, rejection } from "../helpers/validation.js";

/**
 * v1.8.0 source audit (V1): validation must count exactly the files that will be serialized. A
 * plain object reachable twice produces two multipart parts, so it must count twice (cycles are
 * still safe and are rejected by the serializer).
 */
const rules = {
  fileFields: { photo: {}, docs: { max: 2 } },
  fileLimits: { maxFiles: 2, maxTotalSize: 25 },
};

describe("shared references are counted once per occurrence", () => {
  it("a shared object holding a file twice counts as two files (maxFiles)", async () => {
    const shared = { f: file(1) };
    const error = (await rejection(
      petApi("live", {
        resource: { fileFields: { a: {}, b: {} }, fileLimits: { maxFiles: 1 } },
      }).api.pets.create({
        a: shared,
        b: shared,
      }),
    )) as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.violations).toEqual([{ code: "TOO_MANY_FILES", path: "$", limit: 1, actual: 2 }]);
  });

  it("the same large file reached through two references counts twice toward maxTotalSize", async () => {
    const big = file(20);
    const error = (await rejection(
      petApi("live", {
        resource: { fileFields: { docs: {} }, fileLimits: { maxTotalSize: 25 } },
      }).api.pets.create({
        docs: [big, big],
      }),
    )) as ValidationError;
    expect(error.violations[0]).toMatchObject({ code: "TOTAL_TOO_LARGE", actual: 40 });
  });

  it("a cycle is still safe (no hang, validation completes)", async () => {
    const loop: Record<string, unknown> = { f: file(1) };
    loop.self = loop;
    const outcome = await rejection(
      petApi("live", { resource: rules }).api.pets.create({ photo: loop }),
    );
    expect(outcome).toBeDefined();
  });
});
