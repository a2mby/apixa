import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const datasetsRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)), "datasets");

interface ManifestEntry {
  id: string;
  name: string;
  description: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  recordCount: number;
  filePath: string;
  metaPath: string;
  origin: "imported" | "generated";
}

interface Manifest {
  datasets: ManifestEntry[];
  skipped: { sourceUrl: string; reason: string }[];
}

describe("datasets manifest", () => {
  it("lists entries with required provenance fields and matching file counts", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(datasetsRoot, "manifest.json"), "utf8"),
    ) as Manifest;

    expect(manifest.datasets.length).toBeGreaterThan(5);
    expect(manifest.skipped.length).toBeGreaterThan(0);

    for (const entry of manifest.datasets) {
      expect(entry.id).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.sourceUrl).toMatch(/^https?:\/\//);
      expect(entry.license).toBeTruthy();
      expect(entry.attribution).toBeTruthy();
      expect(["imported", "generated"]).toContain(entry.origin);
      expect(entry.recordCount).toBeGreaterThan(0);

      const data = JSON.parse(
        await readFile(resolve(datasetsRoot, entry.filePath), "utf8"),
      ) as unknown[];
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(entry.recordCount);

      const meta = JSON.parse(await readFile(resolve(datasetsRoot, entry.metaPath), "utf8")) as {
        id: string;
        records: number;
      };
      expect(meta.id).toBe(entry.id);
      expect(meta.records).toBe(entry.recordCount);
    }
  });

  it("records DummyJSON and country-codes as skipped with substitutions present", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(datasetsRoot, "manifest.json"), "utf8"),
    ) as Manifest;

    const skippedUrls = manifest.skipped.map((s) => s.sourceUrl);
    expect(skippedUrls).toEqual(
      expect.arrayContaining([
        "https://dummyjson.com/users?limit=100",
        "https://github.com/datasets/country-codes",
        "https://exploremydata.com/datasets/",
      ]),
    );

    const ids = manifest.datasets.map((d) => d.id);
    expect(ids).toEqual(
      expect.arrayContaining(["users-mock", "products-mock", "country-codes-iso"]),
    );
  });
});
