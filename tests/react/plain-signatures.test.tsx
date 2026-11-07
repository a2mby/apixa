/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useResource } from "../../packages/react/src/use-resource.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);
describe("metadata-free operation arguments", () => {
  it("passes no arguments to an optional scalar getAll", async () => {
    const getAll = vi.fn(async (filter?: string) => [filter ?? "all"]);
    const { result } = renderHook(() => useResource({ getAll }, { queryKey: ["items"] }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data).toEqual(["all"]));
    expect(getAll).toHaveBeenCalledWith();
  });
  it("preserves detail arguments without injecting request options", async () => {
    const getById = vi.fn(async (id: string, options?: { flavor?: string }) => ({ id, options }));
    const { result } = renderHook(
      () =>
        useResourceQuery({ getById }, { queryKey: ["items"], operation: "getById", args: ["42"] }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data?.id).toBe("42"));
    expect(getById).toHaveBeenCalledWith("42");
  });
});

it("preserves each explicit tuple and does not mutate custom option objects", async () => {
  const client = new QueryClient();
  const { createResourceQueryOptions } = await import("../../packages/react/src/query-options.js");
  const zero = vi.fn(async () => "zero");
  const required = vi.fn(async (filter: string) => filter);
  const options = vi.fn(async (value?: { page?: number }) => value?.page ?? 0);
  const detail = vi.fn(async (id: string, value?: { flavor?: string }) => ({ id, value }));
  const input = { flavor: "vanilla" };
  await client.fetchQuery(createResourceQueryOptions({ getAll: zero }, { queryKey: ["zero"] }));
  await client.fetchQuery(
    createResourceQueryOptions({ getAll: required }, { queryKey: ["required"], args: ["abc"] }),
  );
  await client.fetchQuery(
    createResourceQueryOptions({ getAll: options }, { queryKey: ["options"], args: [{ page: 2 }] }),
  );
  await client.fetchQuery(
    createResourceQueryOptions(
      { getById: detail },
      { queryKey: ["detail"], operation: "getById", args: ["42", input] },
    ),
  );
  expect(zero).toHaveBeenCalledWith();
  expect(required).toHaveBeenCalledWith("abc");
  expect(options).toHaveBeenCalledWith({ page: 2 });
  expect(detail).toHaveBeenCalledWith("42", input);
  expect(input).toEqual({ flavor: "vanilla" });
  expect(client.getQueryData(["detail", "detail", "42", input])).toEqual({
    id: "42",
    value: input,
  });
  client.clear();
});
