"use client";

import {
  hashKey,
  shouldThrowError,
  useQueryClient,
  type MutationObserverResult,
  type QueryKey,
} from "@tanstack/react-query";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { composeResult } from "./compose.js";
import type { RequireTanStackQuery } from "./peer.js";
import { createResourceKeys } from "./keys.js";
import {
  ResourceMutationStore,
  validateConfig,
  type RuntimeMutationsConfig,
} from "./mutation-store.js";
import type { ResourceMutationResult, UseResourceMutationOptions } from "./mutation-types.js";

export type { UseResourceMutationOptions } from "./mutation-types.js";

/**
 * Resource-wide mutations: every enabled Core write is inherited automatically and callable
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
): RequireTanStackQuery<ResourceMutationResult<R, M>>;
export function useResourceMutation(
  resource: object,
  options: RuntimeResourceMutationOptions,
): unknown {
  const state = useResourceMutationState(resource, options);
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
const RESERVED = new Set(["operations", "states", "keys"]);

/** @internal Shared by `useResourceMutation` and `useResource`. */
export function useResourceMutationState(
  resource: object,
  options: RuntimeResourceMutationOptions,
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
  store.renderConfig = config;
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
      out[name] = withMutationState(
        (...args: unknown[]) => store.run(name, args),
        () => store.observer(name, store.renderConfig).getCurrentResult(),
      );
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

/** Native mutation result fields exposed on each callable operation (`users.create.isPending`). */
export const MUTATION_STATE_KEYS = [
  "data",
  "error",
  "variables",
  "context",
  "status",
  "isIdle",
  "isPending",
  "isSuccess",
  "isError",
  "isPaused",
  "failureCount",
  "failureReason",
  "submittedAt",
  "reset",
] as const satisfies ReadonlyArray<keyof MutationObserverResult>;

/**
 * Live getters, not copies: each read returns the observer's current result (the same object
 * `states[name]` returns), so the values are as fresh as the last render. Reading one creates
 * that operation's observer lazily, exactly like reading `states[name]`.
 */
function withMutationState<F extends (...args: unknown[]) => Promise<unknown>>(
  fn: F,
  current: () => MutationObserverResult<unknown, Error, unknown[], unknown>,
): F {
  for (const key of MUTATION_STATE_KEYS) {
    Object.defineProperty(fn, key, { enumerable: false, get: () => current()[key] });
  }
  return fn;
}
