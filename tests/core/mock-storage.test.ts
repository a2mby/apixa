import { MockFileStorage, isMockFileRef, ConfigError } from "@apixa/core";
import { describe, expect, it } from "vitest";
const uuid = (n = 1) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const info = { resource: "docs", field: "file" };

describe("virtual mock file organization", () => {
  it("preserves original UUID refs, copies and metadata without configuration", async () => {
    const storage = new MockFileStorage();
    const meta = await storage.put(
      new File(["abc"], "a b.txt", { type: "text/plain", lastModified: 7 }),
      info,
    );
    expect(meta.ref).toMatch(/^mock-file:\/\/[\da-f-]{36}\/a%20b.txt$/);
    expect(meta).toMatchObject({
      disk: "default",
      path: `${meta.id}/a b.txt`,
      size: 3,
      lastModified: 7,
    });
    expect(Object.isFrozen(meta)).toBe(true);
    expect(storage.get(meta.id)?.text()).toBe("abc");
    expect(storage.get(`mock-file://${meta.id}/legacy-suffix`)?.text()).toBe("abc");
    storage.get(meta.ref)!.bytes().fill(0);
    expect(storage.get(meta.ref)?.text()).toBe("abc");
    expect(isMockFileRef("mock-file://legacy/suffix")).toBe(true);
    expect(isMockFileRef("anything")).toBe(false);
  });
  it("supports disks and portable segment-aware paths without path-based identity", async () => {
    let n = 0;
    const storage = new MockFileStorage({ generateId: () => uuid(++n), directory: "a\\.\\b//" });
    const a = await storage.put(new File(["a"], "x.txt"), { ...info, disk: "one" });
    const b = await storage.put(new File(["b"], "x.txt"), { ...info, disk: "two" });
    await storage.put(new File(["c"], "x.txt"), { ...info, disk: "one", directory: "ab" });
    expect(a.path).toBe("a/b/x.txt");
    expect(storage.list({ disk: "one", path: "a" })).toEqual([a]);
    expect(storage.list({ path: "a/b/" })).toEqual([a, b]);
    expect(storage.list({ path: "" })).toHaveLength(3);
    expect(storage.get("a/b/x.txt")).toBeUndefined();
  });
  it.each([
    "/a",
    "\\a",
    "C:\\a",
    "../a",
    "a/../b",
    "a/%2e%2e/b",
    "a/%252e/b",
    "a/%2f/b",
    "a\0b",
    "https://x",
  ])("rejects unsafe directory %s", (directory) => {
    expect(() => new MockFileStorage({ directory })).toThrow(ConfigError);
  });
  it.each(["", "a/b", "../a", "a b", "__proto__."])("rejects invalid disk %s", (disk) => {
    expect(() => new MockFileStorage({ disk })).toThrow(ConfigError);
  });
  it("keeps legacy unusual display names but makes a safe virtual path", async () => {
    const storage = new MockFileStorage();
    const meta = await storage.put(new File(["x"], "../a%2f\0.txt"), info);
    expect(meta.name).toBe("../a%2f\0.txt");
    expect(meta.path).not.toMatch(/\/%2f|\/\.\.\/|\0/);
  });
  it("supports unique and deterministic naming independent of IDs", async () => {
    const unique = await new MockFileStorage({ generateId: () => uuid(), naming: "unique" }).put(
      new File(["x"], "original.txt"),
      info,
    );
    expect(unique.name).toBe(`${uuid()}.txt`);
    expect(unique.originalName).toBe("original.txt");
    const named = await new MockFileStorage({
      generateId: () => uuid(),
      naming: ({ field }) => `${field}.txt`,
      directory: "",
    }).put(new File(["x"], "original.txt"), info);
    expect(named.path).toBe("file.txt");
    expect(named.ref).toBe(`mock-file://${uuid()}/file.txt`);
  });
  it("rejects duplicate IDs, same disk/path and unsafe naming without replacing bytes", async () => {
    let n = 0;
    const storage = new MockFileStorage({ generateId: () => uuid(++n), directory: "" });
    const meta = await storage.put(new File(["keep"], "x"), info);
    await expect(storage.put(new File(["bad"], "x"), info)).rejects.toMatchObject({
      code: "MOCK_DUPLICATE_ID",
    });
    await expect(
      storage.put(new Blob(["bad"]), { ...info, naming: () => "../bad" }),
    ).rejects.toThrow(ConfigError);
    await expect(
      storage.put(new Blob(["bad"]), { ...info, generateId: () => "bad" }),
    ).rejects.toThrow(ConfigError);
    await expect(
      storage.put(new Blob(["bad"]), { ...info, generateId: () => meta.id }),
    ).rejects.toMatchObject({ code: "MOCK_DUPLICATE_ID" });
    expect(storage.size).toBe(1);
    expect(storage.get(meta.ref)?.text()).toBe("keep");
  });
  it("isolates clients even with identical deterministic refs; listing never reads bytes", async () => {
    const a = new MockFileStorage({ generateId: () => uuid() });
    const b = new MockFileStorage({ generateId: () => uuid() });
    const x = await a.put(new Blob(["a"]), info);
    const y = await b.put(new Blob(["b"]), info);
    expect(x.ref).toBe(y.ref);
    expect(a.get(x.ref)?.text()).toBe("a");
    expect(b.get(y.ref)?.text()).toBe("b");
    expect(a.list({ resource: "docs", field: "file" })).toEqual([x]);
    expect(a.delete(x.ref)).toBe(true);
    expect(a.delete(x.ref)).toBe(false);
    expect(b.has(y.id)).toBe(true);
  });
});
