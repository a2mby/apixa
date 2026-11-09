import { ValidationError } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { file, petApi, rejection } from "../helpers/validation.js";

describe.each(["live", "mock"] as const)("extension and filename rules (%s)", (mode) => {
  const run = (rules: Record<string, unknown>, f: File) =>
    petApi(mode, { resource: { fileFields: { photo: rules, docs: {} } } })
      .api.pets.create({ photo: f })
      .then(
        () => "ok",
        (e) =>
          e instanceof ValidationError
            ? e.violations[0]!.code + ":" + (e.violations[0]!.rule ?? "")
            : Promise.reject(e),
      );

  it("accept/reject extensions are normalized and match the last segment (or a multi-part suffix)", async () => {
    expect(await run({ accept: [".png"] }, file(1, "A.PNG", ""))).toBe("ok");
    expect(await run({ accept: [".PNG"] }, file(1, "a.png", ""))).toBe("ok");
    expect(await run({ accept: [".tar.gz"] }, file(1, "x.tar.gz", ""))).toBe("ok");
    expect(await run({ accept: [".gz"] }, file(1, "x.tar.gz", ""))).toBe("ok");
    expect(await run({ accept: [".png"] }, file(1, "a.jpg", ""))).toMatch(/^TYPE_NOT_ALLOWED/);
    expect(await run({ reject: [".exe", ".bat"] }, file(1, "run.EXE", "application/x"))).toBe(
      "EXTENSION_NOT_ALLOWED:reject",
    );
    expect(await run({ reject: [".exe"] }, file(1, "readme.txt", "text/plain"))).toBe("ok");
  });

  it("a dotfile or a bare dot-extension name has no extension", async () => {
    expect(await run({ accept: [".env"] }, file(1, ".env", ""))).toMatch(/^TYPE_NOT_ALLOWED/);
    expect(await run({ noExtension: "reject" }, file(1, ".env", "text/plain"))).toBe(
      "EXTENSION_NOT_ALLOWED:no-extension",
    );
  });

  it("no-extension policy: allowed by default, rejectable", async () => {
    expect(await run({}, file(1, "README", "text/plain"))).toBe("ok");
    expect(await run({ noExtension: "reject" }, file(1, "README", "text/plain"))).toBe(
      "EXTENSION_NOT_ALLOWED:no-extension",
    );
    expect(await run({ noExtension: "reject" }, file(1, "a.txt", "text/plain"))).toBe("ok");
  });

  it("unicode and multi-dot names", async () => {
    expect(await run({ accept: [".pdf"] }, file(1, "résumé.final.PDF", ""))).toBe("ok");
    expect(await run({ accept: [".pdf"] }, file(1, "日本語.pdf", ""))).toBe("ok");
  });

  it('filename: "strict" flags unsafe names with a rule label and nothing else', async () => {
    const strict = { filename: "strict" };
    expect(await run(strict, file(1, "ok-name.png"))).toBe("ok");
    expect(await run(strict, file(1, "a/b.png"))).toBe("UNSAFE_FILENAME:separator");
    expect(await run(strict, file(1, "a\\b.png"))).toBe("UNSAFE_FILENAME:separator");
    expect(await run(strict, file(1, "a\u0000.png"))).toBe("UNSAFE_FILENAME:control-character");
    expect(await run(strict, file(1, "a".repeat(300) + ".png"))).toBe("UNSAFE_FILENAME:length");
    expect(await run(strict, file(1, "CON.png"))).toBe("UNSAFE_FILENAME:reserved-name");
    expect(await run(strict, file(1, "trailing."))).toBe("UNSAFE_FILENAME:trailing-dot-or-space");
    expect(await run(strict, file(1, "invoice.php.jpg"))).toBe("UNSAFE_FILENAME:double-extension");
    expect(await run(strict, file(1, "archive.tar.gz"))).toBe("ok");
    // Off by default: the same names pass without the opt-in.
    expect(await run({}, file(1, "invoice.php.jpg"))).toBe("ok");
  });

  it("a plain Blob is named `blob` (as sent): no extension", async () => {
    const api = petApi(mode, {
      resource: { fileFields: { photo: { noExtension: "reject" }, docs: {} } },
    }).api;
    const error = (await rejection(api.pets.create({ photo: new Blob(["x"]) }))) as ValidationError;
    expect(error.violations[0]).toMatchObject({
      code: "EXTENSION_NOT_ALLOWED",
      rule: "no-extension",
    });
  });
});
