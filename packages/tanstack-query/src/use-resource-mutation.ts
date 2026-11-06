"use client";

import {
  hashKey,
  noop,
  shouldThrowError,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { composeResult } from "./compose.js";
import { createResourceKeys } from "./keys.js";
import type { OperationData } from "./mutation-controller.js";
import {
  ResourceMutationStore,
  validateConfig,
  type RuntimeMutationsConfig,
} from "./mutation-store.js";
import type {
  OperationMutationOptions,
  ResourceMutationResult,
  UseResourceMutationOptions,
} from "./mutation-types.js";
import type { AsyncFn, OperationParameters } from "./types.js";

export type { UseResourceMutationOptions } from "./mutation-types.js";

/** Options of the single-operation form `useResourceMutation(resource, "create", options)`. */
export type UseOperationMutationOptions<TData, TArgs> = Omit<
  OperationMutationOptions<TData, TArgs>,
  "scope"
> & {
  queryKey: QueryKey;
  /**
   * Apixa key prefix, as in every other hook. TanStack's own mutation `scope` is available per
   * operation in the resource-wide form: `mutations: { create: { scope: { id } } }`.
   */
  scope?: QueryKey;
};

/**
 * Resource-wide mutations: every enabled Core operation is inherited automatically and callable
 * with its own arguments (`await users.create(body)`), with native per-operation state
 * (`users.states.create.isPending`). `mutations: {}` only overrides options or adds client-only
 * operations (`mutationFn`). Observers are created lazily — unused operations cost nothing.
 *
 * ```ts
 * const users = useResourceMutation(api.users, {
 *   queryKey: ["users"],
 *   mutations: { create: { onSuccess: (user) => toast(user.name) } },
 * });
 * await users.update("42", { name: "Grace" });
 * ```
 */
export function useResourceMutation<R extends object, M extends object = {}>(
  resource: R,
  options: UseResourceMutationOptions<R, M>,
): ResourceMutationResult<R, M>;
/**
 * Single-operation form: a native `UseMutationResult` whose variables are the operation's
 * argument tuple (`mutateAsync([id, body])`).
 */
export function useResourceMutation<
  TResource extends Record<string, AsyncFn>,
  TName extends keyof TResource & string,
>(
  resource: TResource,
  operationName: TName,
  options: UseOperationMutationOptions<
    OperationData<TResource, TName>,
    OperationParameters<TResource, TName>
  >,
): UseMutationResult<OperationData<TResource, TName>, Error, OperationParameters<TResource, TName>>;
export function useResourceMutation(
  resource: object,
  nameOrOptions: string | RuntimeResourceMutationOptions,
  single?: RuntimeSingleOptions,
): unknown {
  const name = typeof nameOrOptions === "string" ? nameOrOptions : undefined;
  const options: RuntimeResourceMutationOptions =
    name === undefined
      ? (nameOrOptions as RuntimeResourceMutationOptions)
      : singleToResource(name, single!);
  const state = useResourceMutationState(resource, options);
  if (name !== undefined) {
    const observer = state.store.observer(name, state.config);
    const result = observer.getCurrentResult();
    return {
      ...result,
      mutate: (args: unknown[], callbacks?: Parameters<typeof observer.mutate>[1]) => {
        observer.mutate(args, callbacks).catch(noop);
      },
      mutateAsync: result.mutate,
    };
  }
  return composeResult(undefined, {
    ...state.flat,
    operations: state.operations,
    states: state.states(),
    keys: state.store.keys,
  });
}

export type RuntimeResourceMutationOptions = {
  queryKey: QueryKey;
  scope?: QueryKey;
  mutations?: RuntimeMutationsConfig;
};
type RuntimeSingleOptions = { queryKey: QueryKey; scope?: QueryKey } & Record<string, unknown>;

function singleToResource(
  name: string,
  single: RuntimeSingleOptions,
): RuntimeResourceMutationOptions {
  const { queryKey, scope, ...config } = single;
  return { queryKey, scope, mutations: { [name]: config } };
}

const RESERVED = new Set(["operations", "states", "keys"]);

/** @internal Shared by `useResourceMutation` and `useResource`. */
export function useResourceMutationState(
  resource: object,
  options: RuntimeResourceMutationOptions,
  filter?: (name: string, store: ResourceMutationStore) => boolean,
) {
  const client = useQueryClient();
  const config = options.mutations ?? EMPTY;
  const keyHash = hashKey([...(options.scope ?? []), ...options.queryKey]);
  const store = useMemo(
    () =>
      new ResourceMutationStore(
        client,
        resource,
        createResourceKeys({ queryKey: options.queryKey, scope: options.scope }),
        config,
      ),
    // The key is hashed exactly like TanStack hashes keys; config changes go through commit().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, resource, keyHash],
  );
  useEffect(() => {
    store.commit(config);
  });
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  for (const observer of store.createdObservers()) {
    const result = observer.getCurrentResult();
    if (result.error && shouldThrowError(observer.options.throwOnError, [result.error])) {
      throw result.error;
    }
  }

  validateConfig(store.table, config);
  const names = store.names(config);
  const namesKey = names.join("\u0000");
  const operations = useMemo(() => {
    const out: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
    for (const name of names) {
      if (filter && !filter(name, store)) continue;
      out[name] = (...args: unknown[]) => store.run(name, args);
    }
    return Object.freeze(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, namesKey]);
  const flat: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(operations)) if (!RESERVED.has(name)) flat[name] = fn;

  /** Lazy getters: reading `states.create` creates (only) that observer. */
  const states = () => {
    const out = {};
    for (const name of Object.keys(operations)) {
      Object.defineProperty(out, name, {
        enumerable: true,
        get: () => store.observer(name, config).getCurrentResult(),
      });
    }
    return Object.freeze(out);
  };
  return { store, config, operations, flat, states };
}

const EMPTY: RuntimeMutationsConfig = Object.freeze({});
