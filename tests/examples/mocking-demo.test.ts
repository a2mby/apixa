import { describe, expect, it } from "vitest";
import {
  runCrudErrorsReset,
  runCustomOperations,
  runDirectImport,
  runInline,
  runIsolation,
  runLazyLoad,
  runPaginationAndSlice,
  runStandalone,
} from "../../examples/frontends/query-ssr-next/lib/mocking-demo.js";

/** The /mocking page calls exactly these: the documented pass conditions must hold. */
describe("examples/frontends/query-ssr-next mocking scenarios", () => {
  it("inline records: inferred create and list", async () => {
    const { created, all, rex } = await runInline();
    expect(rex).toMatchObject({ id: "1", name: "Rex" });
    expect(created).toMatchObject({ id: "3", name: "Mia" });
    expect(all).toHaveLength(3);
  });

  it("direct import and lazy load", async () => {
    expect(runDirectImport().count).toBe(100);
    expect((await runLazyLoad()).count).toBe(250);
  });

  it("pagination and slice follow the Core contract", async () => {
    const r = await runPaginationAndSlice();
    expect(r.page2).toEqual({ page: 2, total: 100, rows: 5 });
    expect(r.pastTheEnd).toEqual({ rows: 0, total: 100 });
    expect(r.slice).toEqual({ listed: 3, counted: 100 });
    expect(r.filtered.rows).toBeLessThanOrEqual(2);
  });

  it("CRUD, errors and reset", async () => {
    const log = (await runCrudErrorsReset()) as Array<Record<string, unknown>>;
    expect(log[2]).toMatchObject({ code: "MOCK_NOT_FOUND" });
    expect(log[3]).toEqual({ afterReset: 2 });
  });

  it("custom operations: handlers run, a declarative operation without one is unsupported", async () => {
    const r = await runCustomOperations();
    expect(r.before).toEqual(["2"]);
    expect(r.vaccinated).toMatchObject({ id: "1", vaccinated: true });
    expect(r.after).toEqual(["1", "2"]);
    expect(r.stats).toBe("MOCK_UNSUPPORTED");
    expect(r.first).toMatchObject({ id: "1" });
  });

  it("standalone mocks and isolation", async () => {
    const s = await runStandalone();
    expect(s).toMatchObject({ users: 100, page: { total: 100, rows: 3 }, error: "NOT_FOUND" });
    const first = await runIsolation();
    const second = await runIsolation();
    expect(first.freshCount).toBe(2);
    expect(second.sharedCount).toBe(first.sharedCount + 1);
    expect(second.freshCount).toBe(2);
  });
});
