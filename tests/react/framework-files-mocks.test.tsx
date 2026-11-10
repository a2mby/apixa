/** @vitest-environment jsdom */
import {
  ValidationError,
  defineApi,
  mockFileFixture,
  mockFiles,
  mockFixtureRef,
  resetMock,
  type Transport,
} from "@apixa/core";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useResource } from "../../packages/react/src/use-resource.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { bytesOf } from "../helpers/framework-files.js";
import { newClient, wrap } from "../helpers/query.js";

afterEach(cleanup);

/** A mocked operation must never reach the network. */
const forbidden: Transport = {
  request() {
    throw new Error("a mocked operation reached the transport");
  },
};

type Pet = { id: number; name: string; photo?: string | null };
/** The slice of the mock handler context this test uses. */
type MockCtx = {
  params: Record<string, string | undefined>;
  store: { get(id: string): Record<string, unknown> };
  files: { get(ref: string): { blob(): Blob } };
};

function makeApi(storage: Record<string, unknown> = { disk: "react" }) {
  return defineApi<{ pets: { path: "/pets"; entity: Pet } }>()({
    baseURL: "https://example.test",
    transport: forbidden,
    resources: {
      pets: {
        path: "/pets",
        fileFields: { photo: { maxSize: 8, accept: ["image/*", "text/plain"] } },
        mock: {
          data: [{ id: 1, name: "Seed", photo: mockFixtureRef("seed") }],
          fixtures: { seed: mockFileFixture("seed", { name: "seed.txt", type: "text/plain" }) },
          storage,
        },
        operations: {
          // A download is an ordinary operation; the mock handler reads the virtual file store.
          picture: {
            kind: "read",
            method: "GET",
            path: "/:id/picture",
            responseType: "blob",
            mock: ({ params, store, files }: MockCtx) =>
              files.get(store.get(params.id as string).photo as string).blob(),
          },
        },
      },
    },
  } as never) as never as {
    pets: {
      getById(id: number): Promise<Pet>;
      getAll(): Promise<Pet[]>;
      create(body: unknown, options?: object): Promise<Pet>;
      picture(id: number, options?: object): Promise<Blob>;
    };
  };
}

const file = (size: number, name = "a.txt", type = "text/plain") =>
  new File([new Uint8Array(size).fill(65)], name, { type });

describe("mocks, fixtures and validation through the hooks", () => {
  it("a mocked download through a query returns the stored fixture bytes, and no request leaves", async () => {
    const api = makeApi();
    const { result } = renderHook(
      () =>
        useResourceQuery(
          api.pets as never,
          { queryKey: ["pets"], operation: "picture", args: [1] } as never,
        ),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect((result.current as { isSuccess: boolean }).isSuccess).toBe(true));
    const blob = (result.current as unknown as { data: Blob }).data;
    expect(blob.size).toBe(4);
    expect(new TextDecoder().decode(await bytesOf(blob))).toBe("seed");
  });

  it("an accepted file is stored and the list refetches; a rejected one leaves the store, the records and the cache untouched", async () => {
    const api = makeApi();
    const { result } = renderHook(
      () => useResource(api.pets as never, { queryKey: ["pets"] } as never),
      { wrapper: wrap(newClient()) },
    );
    type Hook = { create(b: unknown): Promise<Pet>; data?: Pet[]; isSuccess: boolean };
    await waitFor(() => expect((result.current as { isSuccess: boolean }).isSuccess).toBe(true));
    const filesBefore = mockFiles(api as never).size;
    let error: unknown;
    await act(async () => {
      error = await (result.current as unknown as Hook)
        .create({ name: "big", photo: file(99) })
        .catch((e: unknown) => e);
    });
    expect(error).toBeInstanceOf(ValidationError);
    expect(mockFiles(api as never).size).toBe(filesBefore);
    expect(((result.current as unknown as Hook).data ?? []).map((p) => p.name)).toEqual(["Seed"]);

    await act(async () => {
      await (result.current as unknown as Hook).create({ name: "ok", photo: file(4) });
    });
    await waitFor(() =>
      expect(((result.current as unknown as Hook).data ?? []).map((p) => p.name)).toEqual([
        "Seed",
        "ok",
      ]),
    );
    expect(mockFiles(api as never).size).toBe(filesBefore + 1);
  });

  it("resetMock restores the seed and isolates tests; another client has its own store", async () => {
    const a = makeApi({ disk: "a" });
    const b = makeApi({ disk: "a" });
    await a.pets.create({ name: "extra", photo: file(3) });
    expect(mockFiles(a as never).size).toBe(2);
    expect(mockFiles(b as never).size).toBe(0);
    resetMock(a as never);
    expect(mockFiles(a as never).size).toBe(0);
    expect((await a.pets.getAll()).map((p) => p.name)).toEqual(["Seed"]);
  });

  it("a response limit applies to a mocked download through the hook", async () => {
    const api = makeApi();
    const { result } = renderHook(
      () =>
        useResourceQuery(
          api.pets as never,
          { queryKey: ["pets"], operation: "picture", args: [1, { maxResponseSize: 2 }] } as never,
        ),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect((result.current as { isError: boolean }).isError).toBe(true));
    expect((result.current as { error: unknown }).error).toBeInstanceOf(ValidationError);
  });
});
