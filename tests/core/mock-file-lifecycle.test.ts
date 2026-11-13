import { defineApi, mockFiles, resetMock } from "@apixa/core";
import { describe, expect, it } from "vitest";

/**
 * v1.8.0 Batch 2 — mock file lifecycle contract (register L6, L19). Apixa owns only this
 * client-side, in-memory storage; the author owns business deletion and replacement policy.
 */
const setup = () =>
  defineApi({
    baseURL: "https://example.test",
    resources: {
      docs: { path: "/docs", fileFields: ["file"], mock: [{ id: 1, file: "" }] },
    },
  });
const blob = (text: string) => new Blob([text]);
type Doc = { id: number; file: string };

describe("replacement and ownership", () => {
  it("replacing a file in the only owner removes the old file (no orphan)", async () => {
    const api = setup();
    const a = (await api.docs.create({ file: blob("one") } as never)) as unknown as Doc;
    const old = a.file;
    const updated = (await api.docs.update(a.id, {
      body: { file: blob("two") } as never,
    })) as unknown as Doc;
    expect(updated.file).not.toBe(old);
    expect(mockFiles(api)!.has(old)).toBe(false);
    expect(mockFiles(api)!.get(updated.file)!.text()).toBe("two");
    expect(mockFiles(api)!.size).toBe(1);
  });

  it("replacing a file keeps the old one while another record still references it", async () => {
    const api = setup();
    const a = (await api.docs.create({ file: blob("shared") } as never)) as unknown as Doc;
    const b = (await api.docs.create({ file: a.file } as never)) as unknown as Doc;
    await api.docs.update(a.id, { body: { file: blob("mine") } as never });
    expect(mockFiles(api)!.get(a.file)!.text()).toBe("shared");
    await api.docs.update(b.id, { body: { file: blob("also mine") } as never });
    expect(mockFiles(api)!.has(a.file)).toBe(false);
    expect(mockFiles(api)!.size).toBe(2);
  });

  it("deleting every owner leaves no orphans, and cleanup is idempotent", async () => {
    const api = setup();
    const a = (await api.docs.create({ file: blob("x") } as never)) as unknown as Doc;
    const b = (await api.docs.create({ file: a.file } as never)) as unknown as Doc;
    await api.docs.delete(a.id);
    await api.docs.delete(b.id);
    expect(mockFiles(api)!.size).toBe(0);
    resetMock(api);
    resetMock(api);
    mockFiles(api)!.clear();
    mockFiles(api)!.clear();
    expect(mockFiles(api)!.size).toBe(0);
  });

  it("manual put is never collected by managed cleanup", async () => {
    const api = setup();
    const meta = await mockFiles(api)!.put(blob("fixture"), { resource: "docs", field: "file" });
    const a = (await api.docs.create({ file: blob("x") } as never)) as unknown as Doc;
    await api.docs.delete(a.id);
    expect(mockFiles(api)!.has(meta.ref)).toBe(true);
  });
});

describe("L6: low-level delete is deliberate (v1.5.0 contract)", () => {
  it("leaves a stale ref on the record; reads and rewrites stay deterministic", async () => {
    const api = setup();
    const a = (await api.docs.create({ file: blob("x") } as never)) as unknown as Doc;
    const files = mockFiles(api)!;
    expect(files.delete(a.file)).toBe(true);
    expect(files.delete(a.file)).toBe(false); // idempotent boolean
    expect(files.has(a.file)).toBe(false);
    expect(files.get(a.file)).toBeUndefined();
    expect(((await api.docs.getById(a.id)) as unknown as Doc).file).toBe(a.file);
    const replaced = (await api.docs.update(a.id, {
      body: {
        file: blob("fresh"),
      } as never,
    })) as unknown as Doc;
    expect(files.get(replaced.file)!.text()).toBe("fresh");
    await api.docs.delete(a.id);
    expect(files.size).toBe(0);
  });
});

describe("L19: concurrent storage changes during a managed write", () => {
  it("a delete during an in-flight create fails the create without partial state", async () => {
    const api = setup();
    const keep = (await api.docs.create({ file: blob("keep") } as never)) as unknown as Doc;
    const files = mockFiles(api)!;
    let release!: (buffer: ArrayBuffer) => void;
    let began!: () => void;
    const started = new Promise<void>((r) => {
      began = r;
    });
    const slow = blob("slow");
    slow.arrayBuffer = () => {
      began();
      return new Promise((r) => {
        release = r;
      });
    };
    const pending = api.docs.create({ file: slow } as never);
    await started;
    const other = await files.put(blob("other"), { resource: "docs", field: "file" });
    files.delete(other.ref); // storage changed while the stage is open
    release(new TextEncoder().encode("slow").buffer as ArrayBuffer);
    await expect(pending).rejects.toThrow();
    const rows = (await api.docs.getAll()) as unknown as Doc[];
    expect(rows.map((r) => r.id).sort()).toEqual([1, keep.id].sort());
    expect(files.size).toBe(1); // only `keep`'s file: nothing from the failed create survives
    expect(files.has(keep.file)).toBe(true);
  });

  it("concurrent creates all commit, each with its own file", async () => {
    const api = setup();
    const rows = (await Promise.all(
      ["a", "b", "c", "d"].map((t) => api.docs.create({ file: blob(t) } as never)),
    )) as unknown as Doc[];
    expect(new Set(rows.map((r) => r.file)).size).toBe(4);
    expect(mockFiles(api)!.size).toBe(4);
  });
});
