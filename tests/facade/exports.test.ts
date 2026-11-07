import * as coreFacade from "apixa/core";
import * as root from "apixa";
import * as mockingFacade from "apixa/mocking";
import * as datasetsFacade from "apixa/mocking/datasets";
import * as usersFacade from "apixa/mocking/datasets/users";
import * as nodeFacade from "apixa/mocking/node";
import * as reactFacade from "apixa/react";
import * as advancedFacade from "apixa/react/advanced";
import * as core from "@apixa/core";
import * as mocking from "@apixa/mocking";
import * as datasets from "@apixa/mocking/datasets";
import * as users from "@apixa/mocking/datasets/users";
import * as node from "@apixa/mocking/node";
import * as react from "@apixa/react";
import * as advanced from "@apixa/react/advanced";
import { describe, expect, expectTypeOf, it } from "vitest";
import curated from "./curated-root-exports.json";
import type { ApiClient, OperationMetadata } from "apixa";

const CURATED_ROOT_VALUES: string[] = curated;
const keys = (module: object) => Object.keys(module).sort();

describe("apixa curated root", () => {
  it("exposes exactly the curated runtime symbols", () => {
    expect(keys(root)).toEqual(CURATED_ROOT_VALUES);
  });

  it("re-exports the canonical implementations, not copies", () => {
    for (const name of CURATED_ROOT_VALUES) {
      const source = name in core ? core : mocking;
      expect(root[name as keyof typeof root], name).toBe((source as Record<string, unknown>)[name]);
    }
  });

  it("keeps full Core, Mocking and React functionality out of the root", () => {
    for (const hidden of [
      "MockStore",
      "resetMock",
      "registerMockDatasetLoader",
      "createIdempotencyKey",
      "expandOperations",
      "loadDataset",
      "listDatasetIds",
      "MockingErrors",
      "useResource",
      "useResourceQuery",
      "QueryClient",
      "ApixaProvider",
    ]) {
      expect(root, hidden).not.toHaveProperty(hidden);
    }
  });

  it("types a client built through the facade", () => {
    const api = root.defineApi<{ users: { entity: { id: string; name: string } } }>()({
      baseURL: "https://example.test",
      resources: { users: { path: "/users" } },
    });
    expectTypeOf(api.users.getAll).toBeFunction();
    expectTypeOf(api.users.getById).returns.resolves.toEqualTypeOf<{ id: string; name: string }>();
    expectTypeOf<ApiClient<any, any>>().not.toBeAny();
    expectTypeOf<OperationMetadata>().not.toBeAny();
    expect(root.getOperationMetadata(api.users)?.getAll).toMatchObject({ kind: "read" });
  });
});

describe("specialized subpaths", () => {
  const cases: [string, object, object][] = [
    ["apixa/core", coreFacade, core],
    ["apixa/mocking", mockingFacade, mocking],
    ["apixa/mocking/datasets", datasetsFacade, datasets],
    ["apixa/mocking/datasets/users", usersFacade, users],
    ["apixa/mocking/node", nodeFacade, node],
    ["apixa/react", reactFacade, react],
    ["apixa/react/advanced", advancedFacade, advanced],
  ];

  it.each(cases)(
    "%s exposes the same names and the same objects as its package",
    (_, facade, pkg) => {
      expect(keys(facade)).toEqual(keys(pkg));
      for (const name of Object.keys(pkg)) {
        expect((facade as Record<string, unknown>)[name], name).toBe(
          (pkg as Record<string, unknown>)[name],
        );
      }
    },
  );

  it("apixa/core is a superset of the curated root", () => {
    for (const name of CURATED_ROOT_VALUES.filter((n) => n in core))
      expect(coreFacade).toHaveProperty(name);
  });

  it("offers the Apixa-owned React API on the client entry", () => {
    for (const name of [
      "QueryClient",
      "ApixaProvider",
      "ApixaHydrationBoundary",
      "useResource",
      "useResourceQuery",
      "useResourceMutation",
    ]) {
      expect(reactFacade, name).toHaveProperty(name);
    }
  });

  it("offers a server-safe QueryClient and dehydrate on the advanced entry", () => {
    expect(advancedFacade.QueryClient).toBe(reactFacade.QueryClient);
    expect(typeof advancedFacade.dehydrate).toBe("function");
  });
});
