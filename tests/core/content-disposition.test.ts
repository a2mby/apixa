import { parseContentDisposition } from "@apixa/core";
import { describe, expect, it } from "vitest";

describe("parseContentDisposition", () => {
  it("reads type and filename (quoted, unquoted, case-insensitive)", () => {
    expect(parseContentDisposition('attachment; filename="report.pdf"')).toEqual({
      type: "attachment",
      filename: "report.pdf",
    });
    expect(parseContentDisposition("Attachment; FileName=report.pdf")).toEqual({
      type: "attachment",
      filename: "report.pdf",
    });
    expect(parseContentDisposition("inline")).toEqual({ type: "inline" });
    expect(parseContentDisposition('form-data; name="f"; filename="a.txt"')).toEqual({
      type: "form-data",
      filename: "a.txt",
    });
  });

  it("keeps semicolons and escaped quotes inside quoted names", () => {
    expect(parseContentDisposition('attachment; filename="a;b \\"c\\".txt"').filename).toBe(
      'a;b "c".txt',
    );
  });

  it("prefers filename* (RFC 5987) and decodes UTF-8 and ISO-8859-1", () => {
    expect(
      parseContentDisposition(
        "attachment; filename=\"fallback.txt\"; filename*=UTF-8''%E2%82%AC%20rates.txt",
      ).filename,
    ).toBe("€ rates.txt");
    expect(
      parseContentDisposition("attachment; filename*=iso-8859-1'en'%A3%20rates.txt").filename,
    ).toBe("£ rates.txt");
    // order does not matter
    expect(
      parseContentDisposition("attachment; filename*=UTF-8''a%20b.txt; filename=\"x.txt\"")
        .filename,
    ).toBe("a b.txt");
  });

  it("falls back to filename when filename* is malformed or has an unknown charset", () => {
    expect(
      parseContentDisposition("attachment; filename*=UTF-8''%E2%82; filename=\"ok.txt\"").filename,
    ).toBe("ok.txt");
    expect(
      parseContentDisposition("attachment; filename*=UTF-8''%ZZ; filename=ok.txt").filename,
    ).toBe("ok.txt");
    expect(
      parseContentDisposition("attachment; filename*=nope-9''x.txt; filename=y.txt").filename,
    ).toBe("y.txt");
    expect(parseContentDisposition("attachment; filename*=garbage").filename).toBeUndefined();
  });

  it("strips directory parts and control characters", () => {
    expect(parseContentDisposition('attachment; filename="../../etc/passwd"').filename).toBe(
      "passwd",
    );
    expect(parseContentDisposition('attachment; filename="C:\\\\tmp\\\\a.txt"').filename).toBe(
      "a.txt",
    );
    expect(
      parseContentDisposition("attachment; filename*=UTF-8''..%2F..%2Fx%0A.txt").filename,
    ).toBe("x.txt");
    expect(parseContentDisposition('attachment; filename=".."').filename).toBeUndefined();
    expect(parseContentDisposition('attachment; filename=""').filename).toBeUndefined();
  });

  it("accepts Headers, strings, and absent input; never throws", () => {
    expect(
      parseContentDisposition(
        new Headers({ "content-disposition": 'attachment; filename="h.bin"' }),
      ),
    ).toEqual({ type: "attachment", filename: "h.bin" });
    expect(parseContentDisposition(new Headers())).toEqual({ type: "" });
    expect(parseContentDisposition(null)).toEqual({ type: "" });
    expect(parseContentDisposition(undefined)).toEqual({ type: "" });
    expect(parseContentDisposition("")).toEqual({ type: "" });
    for (const bad of [
      ";;;",
      "=",
      'attachment; filename="unterminated',
      "attachment; =x",
      "\u0000",
    ]) {
      expect(() => parseContentDisposition(bad)).not.toThrow();
    }
    expect(parseContentDisposition("attachment;").filename).toBeUndefined();
    expect(parseContentDisposition('attachment; filename="unterminated').type).toBe("attachment");
  });
});
