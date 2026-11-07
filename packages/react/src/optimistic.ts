import type { Query, QueryCacheNotifyEvent, QueryClient, QueryKey } from "@tanstack/react-query";

/** One optimistic change to one cache entry, owned by one mutation call. */
type Layer = {
  token: object;
  apply: (data: unknown) => unknown;
  /** The mutation succeeded; the change stays until server data replaces the base. */
  committed: boolean;
};

/**
 * Optimistic state of one query: the last data that did not come from an optimistic layer
 * (`base`) and the layers on top, in the order their mutations started.
 * Visible data is always `layers.reduce(apply, base)`.
 */
type Entry = {
  query: Query;
  base: unknown;
  layers: Layer[];
};

/** A cache entry an optimistic update targets, and how it changes. */
export type OptimisticTarget = {
  queryKey: QueryKey;
  /** `true`: only this exact key. Default: every cached query under the key (prefix). */
  exact?: boolean;
  /** Receives existing raw data (entries without data are skipped); returns the new data. */
  update(current: never): unknown;
};

/** A fetch that was in flight at some moment, identified by its native promise. */
export type InFlightFetch = { query: Query; promise: Promise<unknown> };

/** The fetches currently in flight for `queries` (entries with data only; see below). */
export function inFlightFetches(queries: Iterable<Query>): InFlightFetch[] {
  const out: InFlightFetch[] = [];
  for (const query of queries) {
    const promise = query.promise;
    if (query.state.fetchStatus === "fetching" && query.state.data !== undefined && promise) {
      out.push({ query, promise });
    }
  }
  return out;
}

/**
 * Restarts fetches that were sent before a write reached the server and are still the entry's
 * current fetch (nothing, such as a native invalidation, has replaced them since). Like native
 * `refetch({ cancelRefetch: true })`: the old response is discarded and callers awaiting it get
 * the new one. Entries without data are not restarted (TanStack would dedupe the fetch anyway).
 */
export function restartStaleFetches(fetches: readonly InFlightFetch[]): void {
  for (const { query, promise } of fetches) {
    if (query.state.fetchStatus !== "fetching" || query.promise !== promise) continue;
    void query.fetch(undefined, { cancelRefetch: true }).catch(() => undefined);
  }
}

const REGISTRIES = new WeakMap<QueryClient, OptimisticLayers>();

/**
 * Concurrency-safe optimistic updates over the native QueryCache (no second cache).
 *
 * - `begin` cancels in-flight fetches of the targets, records each entry's base, and applies a
 *   layer. Overlapping mutations stack layers on the same entry.
 * - `settle(token, false)` removes only that mutation's layer and recomputes from the base, so a
 *   failure never restores a snapshot over another mutation's newer change.
 * - `settle(token, true)` keeps the layer (as committed) until server data arrives.
 * - Server data for an entry (a fetch, not a manual write) becomes the new base: committed layers
 *   are dropped (the server has them) and pending layers are re-applied, so a refetch during a
 *   pending mutation cannot erase its optimistic change.
 * - A manual write by someone else (`setQueryData`) takes the entry over: Apixa forgets its layers
 *   there and will not roll that entry back.
 *
 * Entries are deleted as soon as no pending layer remains; the cache subscription exists only
 * while some entry does.
 */
export class OptimisticLayers {
  readonly #entries = new Map<string, Entry>();
  #unsubscribe: (() => void) | undefined;
  #writing = false;

  private constructor(private readonly client: QueryClient) {}

  static for(client: QueryClient): OptimisticLayers {
    let registry = REGISTRIES.get(client);
    if (!registry) {
      registry = new OptimisticLayers(client);
      REGISTRIES.set(client, registry);
    }
    return registry;
  }

  /** Number of entries holding layers (for tests and leak checks). */
  get size(): number {
    return this.#entries.size;
  }

  async begin(token: object, targets: readonly OptimisticTarget[]): Promise<void> {
    const cache = this.client.getQueryCache();
    const matches: Array<{ query: Query; update: (current: unknown) => unknown }> = [];
    // `update(current: never)` lets callers annotate their own data type; data is passed as-is.
    for (const target of targets) {
      for (const query of cache.findAll({ queryKey: target.queryKey, exact: target.exact })) {
        matches.push({ query, update: target.update as (current: unknown) => unknown });
      }
    }
    if (matches.length === 0) return;
    // Like the TanStack optimistic-update recipe: stop in-flight fetches from overwriting us.
    await Promise.all(
      matches.map(({ query }) =>
        this.client.cancelQueries({ queryKey: query.queryKey, exact: true }),
      ),
    );
    for (const { query, update } of matches) {
      let entry = this.#entries.get(query.queryHash);
      if (!entry) {
        if (query.state.data === undefined) continue; // never invent data for an empty entry
        entry = { query, base: query.state.data, layers: [] };
        this.#entries.set(query.queryHash, entry);
      }
      entry.layers.push({
        token,
        committed: false,
        apply: (data) => (data === undefined ? data : update(data)),
      });
      this.#write(entry);
    }
    this.#subscribe();
  }

  /**
   * Settles one mutation's layers. On success, returns the fetches of its entries that were in
   * flight at commit time: they were sent before the server had the change, so their responses
   * are stale (pass them to `restartStaleFetches` once invalidation has started).
   */
  settle(token: object, succeeded: boolean): InFlightFetch[] {
    const inFlight: InFlightFetch[] = [];
    for (const [hash, entry] of [...this.#entries]) {
      const index = entry.layers.findIndex((layer) => layer.token === token);
      if (index === -1) continue;
      if (succeeded) {
        entry.layers[index]!.committed = true;
        inFlight.push(...inFlightFetches([entry.query]));
      } else entry.layers.splice(index, 1);
      if (entry.layers.every((layer) => layer.committed)) {
        // Nothing pending: visible data is final until the next server fetch.
        if (!succeeded) this.#write(entry);
        this.#entries.delete(hash);
      } else {
        this.#write(entry);
      }
    }
    this.#maybeUnsubscribe();
    return inFlight;
  }

  #write(entry: Entry): void {
    const visible = entry.layers.reduce<unknown>((data, layer) => layer.apply(data), entry.base);
    this.#writing = true;
    try {
      this.client.setQueryData(entry.query.queryKey, visible);
    } finally {
      this.#writing = false;
    }
  }

  #subscribe(): void {
    if (this.#unsubscribe || this.#entries.size === 0) return;
    this.#unsubscribe = this.client.getQueryCache().subscribe((event) => this.#onEvent(event));
  }

  #maybeUnsubscribe(): void {
    if (this.#entries.size === 0 && this.#unsubscribe) {
      this.#unsubscribe();
      this.#unsubscribe = undefined;
    }
  }

  #onEvent(event: QueryCacheNotifyEvent): void {
    const entry = this.#entries.get(event.query.queryHash);
    if (!entry) return;
    if (event.type === "removed") {
      this.#entries.delete(event.query.queryHash);
      this.#maybeUnsubscribe();
      return;
    }
    if (event.type !== "updated" || event.action.type !== "success" || this.#writing) return;
    if (event.action.manual) {
      // Someone else wrote this entry directly; it is theirs now.
      this.#entries.delete(event.query.queryHash);
      this.#maybeUnsubscribe();
      return;
    }
    entry.base = event.query.state.data;
    entry.layers = entry.layers.filter((layer) => !layer.committed);
    if (entry.layers.length === 0) {
      this.#entries.delete(event.query.queryHash);
      this.#maybeUnsubscribe();
    } else {
      this.#write(entry);
    }
  }
}
