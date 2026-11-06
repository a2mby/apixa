import {
  MutationObserver,
  type MutationObserverOptions,
  type QueryClient,
} from "@tanstack/react-query";
import { createIdempotencyKey } from "@apixa/core";
import {
  inFlightFetches,
  OptimisticLayers,
  restartStaleFetches,
  type OptimisticTarget,
} from "./optimistic.js";
import {
  assertNoFullResponse,
  describeOperations,
  isPlainObject,
  type OperationInfo,
} from "./operations.js";
import { withOptions } from "./query-options.js";
import type { ResourceKeyFactory } from "./types.js";

type AnyFn = (...args: unknown[]) => Promise<unknown>;
type Observer = MutationObserver<unknown, Error, unknown[], unknown>;

/** Untyped per-operation config (the typed surface lives in `mutation-types.ts`). */
export type RuntimeOperationConfig = Omit<
  MutationObserverOptions<unknown, Error, unknown[], unknown>,
  "mutationFn" | "mutationKey"
> & {
  mutationFn?: AnyFn;
  invalidate?: unknown;
  optimistic?: RuntimeOptimistic;
};

/** Untyped declarative optimistic config (typed in `mutation-types.ts`). */
export type RuntimeOptimistic = {
  detail?: (args: unknown[]) => unknown;
  update?: (current: unknown, args: unknown[]) => unknown;
  list?: (current: unknown, args: unknown[]) => unknown;
  targets?: (args: unknown[], keys: ResourceKeyFactory) => readonly OptimisticTarget[];
};
export type RuntimeMutationsConfig = Readonly<Record<string, RuntimeOperationConfig | undefined>>;

/**
 * One store per hook instance: a lazily created native `MutationObserver` per operation, exposed
 * to React as a single external store. No scheduling of its own — every call is `observer.mutate`.
 */
export class ResourceMutationStore {
  readonly table: ReadonlyMap<string, OperationInfo>;
  readonly #observers = new Map<string, Observer>();
  readonly #unsubscribe = new Map<string, () => void>();
  readonly #listeners = new Set<() => void>();
  #version = 0;
  #config: RuntimeMutationsConfig;
  /** Config of the current render (lazy observers and state getters use it). */
  renderConfig: RuntimeMutationsConfig;
  /** Idempotency key per call, keyed by the call's variables (TanStack retries reuse them). */
  readonly #idempotencyKeys = new WeakMap<object, string>();

  constructor(
    readonly client: QueryClient,
    readonly resource: object,
    readonly keys: ResourceKeyFactory,
    config: RuntimeMutationsConfig,
  ) {
    this.table = describeOperations(resource);
    this.#config = validateConfig(this.table, config);
    this.renderConfig = this.#config;
  }

  /** Inherited operations first (Core order), then client-only ones. */
  names(config: RuntimeMutationsConfig = this.#config): string[] {
    const clientOnly = Object.keys(config).filter((name) => !this.table.has(name));
    return [...this.table]
      .filter(([, info]) => info.kind === "write")
      .map(([name]) => name)
      .concat(clientOnly);
  }

  isRead(name: string): boolean {
    return this.table.get(name)?.kind === "read";
  }

  /** The observer for `name`, created on first use with `config` (render) or the committed one. */
  observer(name: string, config: RuntimeMutationsConfig = this.#config): Observer {
    let observer = this.#observers.get(name);
    if (!observer) {
      observer = new MutationObserver<unknown, Error, unknown[], unknown>(
        this.client,
        this.#options(name, config),
      );
      this.#observers.set(name, observer);
      if (this.#listeners.size > 0) this.#attach(name, observer);
    }
    return observer;
  }

  /** Run one call; each call keeps its own promise (concurrent calls are independent). */
  run(name: string, args: unknown[]): Promise<unknown> {
    // A fresh array per call: its identity is the call's identity (optimistic layer, idempotency).
    return this.observer(name, this.renderConfig).mutate([...args]);
  }

  /** Commit the rendered config (from an effect), like `useMutation`'s `setOptions` effect. */
  commit(config: RuntimeMutationsConfig): void {
    this.#config = validateConfig(this.table, config);
    for (const [name, observer] of this.#observers) {
      observer.setOptions(this.#options(name, this.#config));
    }
  }

  createdObservers(): IterableIterator<Observer> {
    return this.#observers.values();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    if (this.#listeners.size === 1) {
      for (const [name, observer] of this.#observers) this.#attach(name, observer);
    }
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) {
        for (const off of this.#unsubscribe.values()) off();
        this.#unsubscribe.clear();
      }
    };
  };

  getSnapshot = (): number => this.#version;

  #attach(name: string, observer: Observer): void {
    if (this.#unsubscribe.has(name)) return;
    this.#unsubscribe.set(
      name,
      observer.subscribe(() => {
        this.#version++;
        for (const listener of this.#listeners) listener();
      }),
    );
  }

  #options(
    name: string,
    config: RuntimeMutationsConfig,
  ): MutationObserverOptions<unknown, Error, unknown[], unknown> {
    const info = this.table.get(name);
    const entry = config[name] ?? {};
    const { mutationFn, invalidate, optimistic, ...native } = entry;
    const resource = this.resource as Record<string, AnyFn>;
    const keys = this.keys;
    const policy = invalidate ?? "all";
    const defaults = this.client.defaultMutationOptions<
      MutationObserverOptions<unknown, Error, unknown[], unknown>
    >({ mutationKey: keys.mutation(name) });
    // Own options win; otherwise the QueryClient defaults (what TanStack would have used).
    const own = <K extends "onMutate" | "onSuccess" | "onError">(key: K) =>
      Object.prototype.hasOwnProperty.call(entry, key) ? entry[key] : defaults[key];
    const success = own("onSuccess");
    const layers = optimistic ? OptimisticLayers.for(this.client) : undefined;
    const targets = optimistic ? optimisticTargets(name, optimistic, keys) : undefined;
    const idempotencyKeys = this.#idempotencyKeys;
    const owner = this.resource;

    const options: MutationObserverOptions<unknown, Error, unknown[], unknown> = {
      ...native,
      mutationKey: keys.mutation(name),
      mutationFn: (args: unknown[]) => {
        if (!info) return mutationFn!(...args);
        assertNoFullResponse(args, info);
        const run = resource[name];
        if (typeof run !== "function") throw new Error(`Resource has no ${name} operation.`);
        return run(...withIdempotencyKey(owner, name, info, args, idempotencyKeys));
      },
      onSuccess: async (data, args, onMutateResult, context) => {
        // Fetches of optimistic entries sent before the server had this change are stale.
        const stale = layers?.settle(args, true) ?? [];
        const invalidation = applyInvalidation(policy, {
          client: context.client,
          keys,
          data,
          args,
        });
        // After invalidation has (synchronously) restarted what it covers, restart the rest.
        restartStaleFetches(stale);
        await invalidation;
        return success?.(data, args, onMutateResult, context);
      },
    };
    if (layers && targets) {
      const mutate = own("onMutate");
      const failed = own("onError");
      // Internal optimistic work runs first; the consumer's onMutate result stays the native
      // `onMutateResult` that every callback (and `states[op].context`) receives.
      options.onMutate = async (args, context) => {
        await layers.begin(args, targets(args));
        return mutate?.(args, context);
      };
      options.onError = async (error, args, onMutateResult, context) => {
        layers.settle(args, false);
        return failed?.(error, args, onMutateResult, context);
      };
    }
    return options;
  }
}

/** Throws on a mutationFn for an inherited operation or an unknown name without one. */
export function validateConfig(
  table: ReadonlyMap<string, OperationInfo>,
  config: RuntimeMutationsConfig,
): RuntimeMutationsConfig {
  for (const [name, entry] of Object.entries(config)) {
    if (entry === undefined) continue;
    if (table.get(name)?.kind === "read") {
      throw new Error(
        `mutations.${name}: Core classifies "${name}" as a read; use useResourceQuery instead.`,
      );
    }
    const inherited = table.has(name);
    if (inherited && entry.mutationFn !== undefined) {
      throw new Error(
        `mutations.${name}: "${name}" is an operation of this resource; inherited operations run Core's implementation and cannot take a mutationFn.`,
      );
    }
    if (!inherited && typeof entry.mutationFn !== "function") {
      throw new Error(
        `mutations.${name}: not an operation of this resource; a client-only operation needs a mutationFn.`,
      );
    }
    if (entry.optimistic !== undefined) validateOptimistic(name, entry.optimistic);
  }
  return config;
}

function validateOptimistic(name: string, optimistic: RuntimeOptimistic): void {
  if (optimistic === null || typeof optimistic !== "object") {
    throw new Error(`mutations.${name}.optimistic must be an object.`);
  }
  const { detail, update, list, targets } = optimistic;
  if (detail !== undefined && typeof update !== "function") {
    throw new Error(`mutations.${name}.optimistic.detail needs optimistic.update.`);
  }
  if (update !== undefined && detail === undefined) {
    throw new Error(`mutations.${name}.optimistic.update needs optimistic.detail (the id).`);
  }
  if (detail === undefined && list === undefined && targets === undefined) {
    throw new Error(`mutations.${name}.optimistic needs detail + update, list, or targets.`);
  }
  for (const [key, value] of Object.entries({ detail, list, targets })) {
    if (value !== undefined && typeof value !== "function") {
      throw new Error(`mutations.${name}.optimistic.${key} must be a function.`);
    }
  }
}

type InvalidationContext = {
  client: QueryClient;
  keys: ResourceKeyFactory;
  data: unknown;
  args: unknown[];
};

/**
 * Native `invalidateQueries`, plus one correction: a fetch already in flight for an inactive entry
 * was sent before the write and would land afterwards, clearing the invalid mark with old data.
 * Active entries are restarted by TanStack itself (`cancelRefetch`); only still-current fetches of
 * the rest are restarted here, so no request is added for idle entries.
 */
function invalidate(client: QueryClient, queryKey: readonly unknown[]): Promise<void> {
  const inFlight = inFlightFetches(client.getQueryCache().findAll({ queryKey }));
  const done = client.invalidateQueries({ queryKey });
  restartStaleFetches(inFlight);
  return done;
}

/** Delegates to `QueryClient.invalidateQueries`; awaited before the consumer `onSuccess`. */
export async function applyInvalidation(
  policy: unknown,
  { client, keys, data, args }: InvalidationContext,
): Promise<void> {
  if (policy === false || policy === undefined) return;
  if (policy === true || policy === "all") {
    await invalidate(client, keys.all());
  } else if (policy === "lists") {
    await Promise.all([invalidate(client, keys.lists()), invalidate(client, keys.infinites())]);
  } else if (typeof policy === "function") {
    await policy({ client, keys, data, args });
  } else if (typeof policy === "object") {
    const { lists, details } = policy as {
      lists?: boolean;
      details?: (data: unknown, args: unknown[]) => readonly unknown[];
    };
    await Promise.all([
      lists ? invalidate(client, keys.lists()) : undefined,
      lists ? invalidate(client, keys.infinites()) : undefined,
      ...(details?.(data, args) ?? []).map((id) => invalidate(client, keys.detail(id))),
    ]);
  }
}

/** The targets of a declarative `optimistic` config (resolved per call). */
function optimisticTargets(
  name: string,
  optimistic: RuntimeOptimistic,
  keys: ResourceKeyFactory,
): (args: unknown[]) => OptimisticTarget[] {
  validateOptimistic(name, optimistic);
  const { detail, update, list, targets } = optimistic;
  return (args) => {
    const out: OptimisticTarget[] = [];
    if (detail) {
      const ids = detail(args);
      for (const id of Array.isArray(ids) ? ids : ids == null ? [] : [ids]) {
        out.push({ queryKey: keys.detail(id), update: (current) => update!(current, args) });
      }
    }
    if (list) out.push({ queryKey: keys.lists(), update: (current) => list(current, args) });
    if (targets) out.push(...targets(args, keys));
    return out;
  };
}

/**
 * Core operations with `idempotency` get one key per mutation call, created on the first attempt
 * and reused by TanStack retries (they pass the same variables). A key already in the call
 * options wins. Signatures Core does not own are never touched.
 */
function withIdempotencyKey(
  resource: object,
  name: string,
  info: OperationInfo,
  args: unknown[],
  keys: WeakMap<object, string>,
): unknown[] {
  if (!info.idempotency || info.optionsIndex === null) return args;
  const current = args[info.optionsIndex];
  if (current !== undefined && !isPlainObject(current)) return args;
  if (isPlainObject(current) && current.idempotencyKey !== undefined) return args;
  let key = keys.get(args);
  if (key === undefined) {
    key = createIdempotencyKey(resource, name);
    if (key === undefined) return args;
    keys.set(args, key);
  }
  return withOptions(args, info, { idempotencyKey: key });
}
