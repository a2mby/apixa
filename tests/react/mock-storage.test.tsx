/** @vitest-environment jsdom */
import { defineApi, mockFiles, mockFileFixture, mockFixtureRef, resetMock } from "@apixa/core";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { newClient, wrap } from "../helpers/query.js";

afterEach(cleanup);

it("uses fixture-backed resources and managed file mutations through unchanged hooks", async () => {
  const api = defineApi({
    baseURL: "https://example.test",
    resources: {
      docs: {
        path: "/docs",
        fileFields: ["file"],
        mock: {
          data: [{ id: 1, file: mockFixtureRef("seed") }],
          fixtures: { seed: mockFileFixture("seed", { name: "seed.txt" }) },
          storage: { disk: "react" },
        },
      },
    },
  });
  const seed = await api.docs.getById(1);
  expect(mockFiles(api).get(seed.file)?.text()).toBe("seed");
  const { result } = renderHook(() => useResourceMutation(api.docs, { queryKey: ["docs"] }), {
    wrapper: wrap(newClient()),
  });
  await act(async () => {
    await result.current.patch(1, { body: { file: new File(["changed"], "new.txt") } });
  });
  const row = await api.docs.getById(1);
  expect(mockFiles(api).get(row.file)?.text()).toBe("changed");
  resetMock(api);
  expect(mockFiles(api).size).toBe(0);
  expect(
    mockFiles(api)
      .get((await api.docs.getById(1)).file)
      ?.text(),
  ).toBe("seed");
});
