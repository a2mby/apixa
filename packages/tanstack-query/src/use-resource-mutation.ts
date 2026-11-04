"use client";

import {
  useMutation,
  useQueryClient,
  type MutationFunctionContext,
  type QueryKey,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { createResourceKeys } from "./keys.js";

// `any` only at the boundary so any Apixa resource client (any operation name, any signature)
// assigns cleanly — the same pattern `ResourceLike` in types.ts already uses.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AsyncFn = (...args: any[]) => Promise<any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export type UseResourceMutationOptions<TData, TArgs> = {
  /** Required root key segment(s) — same resource identity `useResourceQuery` uses. */
  queryKey: QueryKey;
  scope?: QueryKey;
  /** Invalidate the resource's queries on success (correctness-first, same as create/update/delete). Default `true`. */
  invalidate?: boolean;
  onMutate?: (variables: TArgs, context: MutationFunctionContext) => unknown | Promise<unknown>;
  onSuccess?: (
    data: TData,
    variables: TArgs,
    onMutateResult: unknown,
    context: MutationFunctionContext,
  ) => unknown | Promise<unknown>;
  onError?: (
    error: Error,
    variables: TArgs,
    onMutateResult: unknown,
    context: MutationFunctionContext,
  ) => unknown | Promise<unknown>;
  onSettled?: (
    data: TData | undefined,
    error: Error | null,
    variables: TArgs,
    onMutateResult: unknown,
    context: MutationFunctionContext,
  ) => unknown | Promise<unknown>;
  retry?: boolean | number;
  meta?: Record<string, unknown>;
};

/**
 * Generic mutation hook for any resource operation — the 11 builtins added in v0.10.0
 * (`patch`, `upsert`, `count`, `search`, `createMany`, `deleteMany`, `getMany`, `exists`,
 * `findFirst`, `getBySlug`, `getBy`) or a fully custom operation — that `useResourceQuery`
 * doesn't wire individually. Correctness-first: invalidates the resource's queries on success
 * by default, same as the built-in `create` / `update` / `delete` mutations do.
 *
 * ```ts
 * const patchUser = useResourceMutation(api.users, "patch", { queryKey: ["users"] });
 * await patchUser.mutateAsync([id, { name: "Ada" }]);
 * ```
 */
export function useResourceMutation<
  TResource extends Record<string, AsyncFn>,
  TName extends keyof TResource & string,
>(
  resource: TResource,
  operationName: TName,
  options: UseResourceMutationOptions<
    Awaited<ReturnType<TResource[TName]>>,
    Parameters<TResource[TName]>
  >,
): UseMutationResult<Awaited<ReturnType<TResource[TName]>>, Error, Parameters<TResource[TName]>> {
  const queryClient = useQueryClient();

  const queryKeySerialized = JSON.stringify(options.queryKey);
  const scopeSerialized = JSON.stringify(options.scope ?? null);

  const keys = useMemo(
    () => createResourceKeys({ queryKey: options.queryKey, scope: options.scope }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key segments are serialized above
    [queryKeySerialized, scopeSerialized],
  );

  return useMutation({
    mutationKey: [...keys.all(), "mutation", operationName],
    mutationFn: (args: Parameters<TResource[TName]>) => {
      const run = resource[operationName]!;
      return run(...args) as Promise<Awaited<ReturnType<TResource[TName]>>>;
    },
    onMutate: options.onMutate,
    onSuccess: async (data, variables, onMutateResult, context) => {
      if (options.invalidate !== false) {
        await queryClient.invalidateQueries({ queryKey: keys.all() });
      }
      await options.onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: options.onError,
    onSettled: options.onSettled,
    retry: options.retry,
    meta: options.meta,
  });
}
