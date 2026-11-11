import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDataset } from "../../packages/mocking/src/load.js";

/** v1.8.0 source audit (M1): a dataset id is a name under the root, never a path out of it. */
function makeDataset(dir: string, id: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "meta.json"),
    JSON.stringify({
      id,
      title: id,
      license: "MIT",
      version: "1",
      resource: { path: "/x" },
      schema: { fields: [] },
    }),
  );
  writeFileSync(join(dir, "data.json"), JSON.stringify([{ id: 1, from: id }]));
}

describe("dataset ids cannot escape the datasets root", () => {
  const base = mkdtempSync(join(tmpdir(), "apixa-datasets-"));
  const root = join(base, "root");
  makeDataset(join(root, "inside"), "inside");
  makeDataset(join(base, "outside"), "outside"); // a sibling of the root

  it("loads by folder name and by meta id", async () => {
    expect((await loadDataset("inside", { basePath: root })).records).toEqual([
      { id: 1, from: "inside" },
    ]);
  });

  it.each(["../outside", "inside/../../outside", join(base, "outside")])(
    "refuses %j (outside the root)",
    async (id) => {
      await expect(loadDataset(id, { basePath: root })).rejects.toThrow(/not found/);
    },
  );
});
