import "../../packages/mocking/src/register.js";
import { defineApi, listMockDatasetIds, MOCK_DATASETS } from "@apixa/core";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { catalog, listDatasetIds } from "../../packages/mocking/src/catalog.js";
import { loadDatasetRecords } from "../../packages/mocking/src/datasets.js";

const pkgRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)), "packages/mocking");

describe("one coherent dataset catalog", () => {
  it("Core's advertised ids (autocomplete) and the runtime loaders are the same 15", () => {
    expect(listMockDatasetIds().sort()).toEqual(listDatasetIds().sort());
    expect(listMockDatasetIds()).toHaveLength(15);
    for (const id of listDatasetIds()) expect(MOCK_DATASETS[id]).toBe(catalog[id].idKey);
  });

  it.each(listMockDatasetIds())("%s resolves through defineApi with unique ids", async (id) => {
    const api = defineApi({
      baseURL: "/api",
      resources: { r: { path: "/r", mock: id } },
    }) as unknown as {
      r: { getAll(): Promise<Record<string, unknown>[]>; getById(id: unknown): Promise<unknown> };
    };
    const rows = await api.r.getAll();
    expect(rows.length).toBeGreaterThan(0);
    const idKey = MOCK_DATASETS[id];
    expect(new Set(rows.map((row) => row[idKey])).size).toBe(rows.length);
    expect(await api.r.getById(rows[0]![idKey])).toEqual(rows[0]);
  });

  it("each catalog entry is a lazy loader (no records are held by the catalog)", () => {
    for (const id of listDatasetIds()) expect(typeof catalog[id].load).toBe("function");
  });

  it("loadDatasetRecords imports only the requested dataset", async () => {
    const spies = listDatasetIds().map((id) => [id, vi.spyOn(catalog[id], "load")] as const);
    await loadDatasetRecords("orders-mock");
    for (const [id, spy] of spies) expect(spy).toHaveBeenCalledTimes(id === "orders-mock" ? 1 : 0);
    vi.restoreAllMocks();
  });

  it("the package entry, the loader and registration never statically import dataset JSON", async () => {
    for (const file of [
      "index.ts",
      "loader.ts",
      "register.ts",
      "catalog.ts",
      "mock-api.ts",
      "resource.ts",
    ]) {
      const source = await readFile(resolve(pkgRoot, "src", file), "utf8");
      expect(source, file).not.toMatch(/^import .*\.json["'];?$/m);
    }
  });

  it("only the datasets entry statically imports JSON (its direct exports are eager by design)", async () => {
    const source = await readFile(resolve(pkgRoot, "src", "datasets.ts"), "utf8");
    expect(source).toMatch(/^import .*\.json["'];?$/m);
    expect(source).toContain("loadDataset");
  });

  it("only the explicit registration entry has side effects", async () => {
    const pkg = JSON.parse(await readFile(resolve(pkgRoot, "package.json"), "utf8")) as {
      sideEffects: unknown;
    };
    expect(pkg.sideEffects).toEqual(["./dist/register.js", "./src/register.ts"]);
    const distribution = JSON.parse(
      await readFile(resolve(pkgRoot, "../../package.json"), "utf8"),
    ) as { sideEffects: unknown };
    expect(distribution.sideEffects).toEqual(["./dist/mocking/register.js"]);
  });

  it("an unknown dataset id never reaches the loader", () => {
    expect(() =>
      defineApi({ baseURL: "/api", resources: { r: { path: "/r", mock: "states-csc" as never } } }),
    ).toThrow(/unknown dataset "states-csc"/);
  });
});
