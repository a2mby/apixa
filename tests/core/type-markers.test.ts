import { describe, expect, it } from "vitest";

describe("type() removal", () => {
  it("does not export type from @apixa/core", async () => {
    const core = await import("@apixa/core");
    expect("type" in core).toBe(false);
    expect("Type" in core).toBe(false);
    expect("Infer" in core).toBe(false);
    expect(typeof core.defineApi).toBe("function");
  });
});
