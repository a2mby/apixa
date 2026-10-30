import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as mocking from "@apixa/mocking";
import * as mockingNode from "@apixa/mocking/node";
import * as data from "@apixa/mocking/data";
import type { Comment, Company, Order, Post, Product, User } from "@apixa/mocking/data";
import { catalog, listDatasetIds } from "../../packages/mocking/src/catalog";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const datasetsRoot = resolve(repoRoot, "datasets");
const pkgRoot = resolve(repoRoot, "packages/mocking");

type ManifestEntry = { id: string; filePath: string; metaPath: string; recordCount: number };
const manifest = JSON.parse(await readFile(resolve(datasetsRoot, "manifest.json"), "utf8")) as {
  datasets: ManifestEntry[];
};
const readJson = async <T>(path: string) =>
  JSON.parse(await readFile(resolve(datasetsRoot, path), "utf8")) as T;

// Too large to bundle (>500 KB); two of them also have non-unique id fields.
const NOT_EXPOSED = ["states-csc", "states-parseapi", "counties-parseapi"];

describe("dataset catalog", () => {
  it("only lists datasets that exist in manifest.json", () => {
    const manifestIds = new Set(manifest.datasets.map((d) => d.id));
    for (const id of listDatasetIds()) expect(manifestIds.has(id)).toBe(true);
  });

  it("covers every manifest dataset except the documented exclusions", () => {
    const expected = manifest.datasets.map((d) => d.id).filter((id) => !NOT_EXPOSED.includes(id));
    expect(listDatasetIds().sort()).toEqual(expected.sort());
  });

  it("excludes only datasets that really are large or have ambiguous ids", async () => {
    for (const id of NOT_EXPOSED) {
      const entry = manifest.datasets.find((d) => d.id === id)!;
      const raw = await readFile(resolve(datasetsRoot, entry.filePath), "utf8");
      expect(raw.length).toBeGreaterThan(500 * 1024);
    }
  });

  it.each(listDatasetIds())("%s: id field, ids, and size match the real data", async (id) => {
    const entry = manifest.datasets.find((d) => d.id === id)!;
    const meta = await readJson<{ resource: { idField?: string } }>(entry.metaPath);
    const raw = await readJson<Record<string, unknown>[]>(entry.filePath);

    expect(catalog[id].idKey).toBe(meta.resource.idField ?? "id");
    const loaded = (await catalog[id].load()).default as unknown as Record<string, unknown>[];
    expect(loaded).toEqual(raw);
    expect(loaded).toHaveLength(entry.recordCount);

    // getById() is only meaningful if every record has a distinct, non-empty id.
    const ids = loaded.map((r) => r[catalog[id].idKey]);
    expect(ids.every((v) => (typeof v === "string" || typeof v === "number") && v !== "")).toBe(
      true,
    );
    expect(new Set(ids.map(String)).size).toBe(loaded.length);
  });
});

describe("@apixa/mocking/data", () => {
  it("exports typed records that match the root datasets", async () => {
    expect(data.users).toEqual(await readJson("users/users-mock/data.json"));
    expect(data.products).toEqual(await readJson("products/products-mock/data.json"));
    expect(data.companies).toEqual(await readJson("companies/companies-mock/data.json"));
    expect(data.orders).toEqual(await readJson("orders/orders-mock/data.json"));
    expect(data.posts).toEqual(await readJson("social/posts-mock/data.json"));
    expect(data.comments).toEqual(await readJson("comments/comments-mock/data.json"));
    expect(data.users).toHaveLength(100);
  });

  it("exposes the exports it documents, and nothing from the large datasets", () => {
    expect(Object.keys(data).sort()).toEqual(
      [
        "comments",
        "commentsDataset",
        "companies",
        "companiesDataset",
        "orders",
        "ordersDataset",
        "posts",
        "postsDataset",
        "products",
        "productsDataset",
        "users",
      ].sort(),
    );
  });

  it("types records as read-only entities", () => {
    expectTypeOf(data.users).toEqualTypeOf<readonly User[]>();
    expectTypeOf(data.products).toEqualTypeOf<readonly Product[]>();
    expectTypeOf(data.companies).toEqualTypeOf<readonly Company[]>();
    expectTypeOf(data.orders).toEqualTypeOf<readonly Order[]>();
    expectTypeOf(data.posts).toEqualTypeOf<readonly Post[]>();
    expectTypeOf(data.comments).toEqualTypeOf<readonly Comment[]>();
    expectTypeOf<Product>().toHaveProperty("price").toEqualTypeOf<number>();
  });
});

describe("package surface", () => {
  it("exposes defineMockApi and MockApiError", () => {
    expect(typeof mocking.defineMockApi).toBe("function");
    expect(new mocking.MockApiError("NOT_FOUND", "x")).toBeInstanceOf(Error);
    expect(new mocking.MockApiError("NOT_FOUND", "x").name).toBe("MockApiError");
  });

  it("no longer exposes the removed transport-based APIs", () => {
    for (const removed of ["createMockTransport", "createSelectiveMockTransport"]) {
      expect(removed in mocking).toBe(false);
      expect(removed in mockingNode).toBe(false);
    }
  });

  it("still exposes the Core inline-mocking bridge and Node loaders", () => {
    expect(typeof mocking.enableResourceMocks).toBe("function");
    expect(typeof mocking.registerDatasetPreset).toBe("function");
    expect(typeof mockingNode.loadDataset).toBe("function");
    expect(typeof mockingNode.listDatasets).toBe("function");
  });

  it("maps every package.json export (and the build script) to a real source entry", async () => {
    const pkg = JSON.parse(await readFile(resolve(pkgRoot, "package.json"), "utf8")) as {
      exports: Record<string, { types: string; import: string }>;
      scripts: { build: string };
    };
    expect(Object.keys(pkg.exports)).toEqual(
      expect.arrayContaining([".", "./register", "./node", "./data", "./data/users-mock"]),
    );
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      const source = target.import.replace("./dist/", "src/").replace(/\.js$/, ".ts");
      expect(existsSync(resolve(pkgRoot, source)), `${subpath} → ${source}`).toBe(true);
      expect(target.types).toBe(target.import.replace(/\.js$/, ".d.ts"));
      expect(pkg.scripts.build, `${subpath} missing from build entries`).toContain(source);
    }
  });
});

describe("standalone independence from Core", () => {
  const standalone = [
    "mock-api.ts",
    "resource.ts",
    "catalog.ts",
    "errors.ts",
    "data/index.ts",
    "data/entities.ts",
  ];
  const bridge =
    /["']\.\/(?:register|processor|store|transport|response|presets\/registry)(?:\.js)?["']/;

  it.each(standalone)("%s imports neither @apixa/core nor the legacy bridge", async (file) => {
    const source = await readFile(resolve(pkgRoot, "src", file), "utf8");
    const imports = source.split("\n").filter((line) => /^\s*(import|export)\b.*from\b/.test(line));
    for (const line of imports) {
      expect(line).not.toContain("@apixa/core");
      expect(line).not.toMatch(bridge);
    }
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""); // docs may mention defineApi
    expect(code).not.toMatch(/defineApi|fetch\(|XMLHttpRequest/);
  });
});
