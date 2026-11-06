import {
  MutationObserver,
  type MutationObserverOptions,
  type QueryClient,
} from "@tanstack/react-query";
import { assertNoFullResponse, describeOperations, type OperationInfo } from "./operations.js";
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

  constructor(
    readonly client: QueryClient,
    readonly resource: object,
    readonly keys: ResourceKeyFactory,
    config: RuntimeMutationsConfig,
  ) {
    this.table = describeOperations(resource);
    this.#config = validateConfig(this.table, config);
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
    return this.observer(name).mutate(args);
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
    const { mutationFn, invalidate, onSuccess, ...native } = config[name] ?? {};
    const resource = this.resource as Record<string, AnyFn>;
    const keys = this.keys;
    const policy = invalidate ?? "all";
    const defaultSuccess = this.client.defaultMutationOptions<
      MutationObserverOptions<unknown, Error, unknown[], unknown>
    >({ mutationKey: keys.mutation(name) }).onSuccess;
    const success = Object.prototype.hasOwnProperty.call(config[name] ?? {}, "onSuccess")
      ? onSuccess
      : defaultSuccess;
    return {
      ...native,
      mutationKey: keys.mutation(name),
      mutationFn: (args: unknown[]) => {
        if (!info) return mutationFn!(...args);
        assertNoFullResponse(args, info);
        const run = resource[name];
        if (typeof run !== "function") throw new Error(`Resource has no ${name} operation.`);
        return run(...args);
      },
      onSuccess: async (data, args, onMutateResult, context) => {
        await applyInvalidation(policy, { client: context.client, keys, data, args });
        return success?.(data, args, onMutateResult, context);
      },
    };
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
  }
  return config;
}

type InvalidationContext = {
  client: QueryClient;
  keys: ResourceKeyFactory;
  data: unknown;
  args: unknown[];
};

/** Delegates to `QueryClient.invalidateQueries`; awaited before the consumer `onSuccess`. */
export async function applyInvalidation(
  policy: unknown,
  { client, keys, data, args }: InvalidationContext,
): Promise<void> {
  if (policy === false || policy === undefined) return;
  if (policy === true || policy === "all") {
    await client.invalidateQueries({ queryKey: keys.all() });
  } else if (policy === "lists") {
    await client.invalidateQueries({ queryKey: keys.lists() });
  } else if (typeof policy === "function") {
    await policy({ client, keys, data, args });
  } else if (typeof policy === "object") {
    const { lists, details } = policy as {
      lists?: boolean;
      details?: (data: unknown, args: unknown[]) => readonly unknown[];
    };
    await Promise.all([
      lists ? client.invalidateQueries({ queryKey: keys.lists() }) : undefined,
      ...(details?.(data, args) ?? []).map((id) =>
        client.invalidateQueries({ queryKey: keys.detail(id) }),
      ),
    ]);
  }
}
