import { MockError } from "../errors/index.js";
import { validateRecords, type MockSource, type Row } from "./source.js";

type Id = string | number;

const clone = <T>(value: T): T => {
  const copied = structuredClone(value);
  // Node structuredClone(File) loses its name and becomes Blob. Preserve immutable file metadata
  // while retaining the native clone semantics for every other record value (cycles included).
  const seen = new WeakSet<object>();
  const restore = (source: unknown, target: unknown): unknown => {
    if (typeof File !== "undefined" && source instanceof File && target instanceof Blob)
      return new File([target], source.name, {
        type: source.type,
        lastModified: source.lastModified,
      });
    if (
      !source ||
      !target ||
      typeof source !== "object" ||
      typeof target !== "object" ||
      seen.has(source)
    )
      return target;
    seen.add(source);
    if (
      Array.isArray(source) ||
      Object.getPrototypeOf(source) === Object.prototype ||
      Object.getPrototypeOf(source) === null
    ) {
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(source))) {
        if (!descriptor.enumerable || !("value" in descriptor)) continue;
        const replacement = (target as Row)[key];
        (target as Row)[key] = restore(descriptor.value, replacement);
      }
    }
    return target;
  };
  return restore(value, copied) as T;
};

/** Own-property read: a filter or lookup never sees an inherited value. */
const own = (row: Row, key: string): unknown => (Object.hasOwn(row, key) ? row[key] : undefined);

/**
 * Keys that would change an object's prototype or constructor chain. Mock input containing one
 * (at any depth) is rejected, so a mutation can never alter inherited behavior.
 */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function findUnsafeKey(root: unknown): string | undefined {
  const stack: unknown[] = [root];
  const seen = new Set<unknown>();
  while (stack.length > 0) {
    const value = stack.pop();
    if (value === null || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    for (const key of Object.keys(value)) {
      if (UNSAFE_KEYS.has(key)) return key;
      stack.push((value as Record<string, unknown>)[key]);
    }
  }
  return undefined;
}

/** Exact-match filter used by list / findFirst / count. Reserved paging keys are ignored. */
const RESERVED_QUERY_KEYS = new Set(["page", "pageSize", "cursor", "id", "id[]"]);

function filterEntries(query: Record<string, unknown> | undefined): [string, unknown][] {
  if (!query) return [];
  return Object.entries(query).filter(([k, v]) => !RESERVED_QUERY_KEYS.has(k) && v !== undefined);
}

function matchesExact(row: Row, entries: [string, unknown][]): boolean {
  return entries.every(([key, value]) =>
    Array.isArray(value)
      ? value.map(String).includes(String(own(row, key)))
      : String(own(row, key)) === String(value),
  );
}

function matchesContains(row: Row, entries: [string, unknown][]): boolean {
  return entries.every(([key, value]) =>
    String(own(row, key) ?? "")
      .toLowerCase()
      .includes(String(value).toLowerCase()),
  );
}

/**
 * One resource's in-memory records. Shared by every Core mocked resource and by
 * `@apixa/mocking`'s `defineMockApi()`. State is private to the instance (one per client
 * resource), seeded lazily on first use, cloned on the way in and out, indexed by id.
 */
export class MockStore {
  readonly idKey: string;
  private readonly source: MockSource;
  private initial: Row[] | undefined;
  /**
   * Working rows. They share row objects with `initial` until a row is replaced: every write
   * builds a new row object, and nothing hands out a reference (reads clone). `liveRows()` is the
   * one exception, so it first makes the working rows private (`shared = false`).
   */
  private rows: Row[] = [];
  private shared = true;
  private index = new Map<string, Row>();
  private loading: Promise<void> | undefined;
  private numericIds = true;
  private numberTyped = true;
  /** Monotonic id counter: generated ids are never reused, even after deletes. */
  private counter = 0;
  /** @internal Invalidate asynchronous work synchronously on reset. */
  generation = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private seedSnapshot?: Row[];
  /** @internal Installed by the existing file engine, not a second dataset loader. */
  initializeFiles?: (rows: Row[]) => Promise<{ rows: Row[]; commit(): void; discard(): void }>;
  /** @internal */
  resetFiles?: () => void;

  /** @internal Serialize managed operations without locking other resources. */
  async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const generation = this.generation;
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (generation !== this.generation)
        throw this.fail("MOCK_INVALID_INPUT", "mock state was reset before execution");
      return await work();
    } finally {
      release();
    }
  }

  /** @internal Copy record indexes, not binary data; writes replace rows. */
  fork(): MockStore {
    const draft = new MockStore(this.source);
    draft.initial = this.initial;
    draft.rows = this.rows.slice();
    draft.index = new Map(this.index);
    draft.numericIds = this.numericIds;
    draft.numberTyped = this.numberTyped;
    draft.counter = this.counter;
    draft.generation = this.generation;
    return draft;
  }
  /** @internal Publish one completed draft synchronously. */
  adopt(draft: MockStore): void {
    if (this.generation !== draft.generation)
      throw this.fail("MOCK_INVALID_INPUT", "mock state was reset before commit");
    this.rows = draft.rows;
    this.index = draft.index;
    this.counter = draft.counter;
    this.shared = true;
  }

  constructor(source: MockSource) {
    this.source = source;
    this.idKey = source.idKey;
  }

  private fail(code: ConstructorParameters<typeof MockError>[0], message: string): MockError {
    return new MockError(code, `${this.source.label}: ${message}`);
  }

  /** Load + validate + seed once. Concurrent first calls share one load; a failure is retried next call. */
  ready(signal?: AbortSignal): Promise<void> {
    if (this.initial) return Promise.resolve();
    const generation = this.generation;
    const loading =
      this.loading ??
      (async () => {
        let prepared: Awaited<ReturnType<NonNullable<MockStore["initializeFiles"]>>> | undefined;
        try {
          let seeded = this.seedSnapshot;
          if (!seeded) {
            const records = await this.source.load();
            validateRecords(this.source.label, records, this.idKey);
            const { limit, offset = 0 } = this.source.seed ?? {};
            seeded = records.slice(
              offset,
              limit === undefined ? undefined : offset + limit,
            ) as Row[];
            seeded = this.source.immutable ? seeded : seeded.map(clone);
          }
          if (signal?.aborted) throw signal.reason;
          if (generation !== this.generation)
            throw this.fail("MOCK_INVALID_INPUT", "mock state was reset during initialization");
          if (this.initializeFiles) prepared = await this.initializeFiles(seeded);
          if (signal?.aborted) throw signal.reason;
          if (generation !== this.generation)
            throw this.fail("MOCK_INVALID_INPUT", "mock state was reset during initialization");
          this.seedSnapshot = seeded;
          const initial = prepared?.rows ?? seeded;
          // Build indexes before publishing file state; all failure-prone preparation is complete.
          const index = new Map(initial.map((row) => [String(row[this.idKey]), row]));
          prepared?.commit();
          this.initial = initial;
          this.applyInitial();
          this.index = index;
        } catch (cause) {
          prepared?.discard();
          if (signal?.aborted) throw signal.reason;
          if (
            cause instanceof MockError ||
            (cause instanceof Error && "code" in cause && cause.code === "VALIDATION")
          )
            throw cause;
          const detail = cause instanceof Error ? cause.message : String(cause);
          throw new MockError(
            "MOCK_LOAD",
            `${this.source.label}: failed to load mock data — ${detail}`,
            { cause },
          );
        }
      })();
    this.loading = loading;
    const onAbort = () => {
      if (!this.initial && this.loading === loading) {
        this.loading = undefined;
        this.resetFiles?.();
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    void loading
      .finally(() => {
        signal?.removeEventListener("abort", onAbort);
        if (this.loading === loading) this.loading = undefined;
      })
      .catch(() => undefined);
    return this.loading;
  }

  private applyInitial(): void {
    this.rows = this.initial!.slice();
    this.shared = true;
    this.index = new Map(this.rows.map((row) => [String(row[this.idKey]), row]));
    this.numericIds = this.rows.every((row) => /^\d+$/.test(String(row[this.idKey])));
    this.numberTyped = this.rows.length === 0 || typeof this.rows[0]![this.idKey] === "number";
    this.counter = this.numericIds
      ? Math.max(0, ...this.rows.map((row) => Number(row[this.idKey])))
      : 0;
  }

  /**
   * Live rows for custom `defineMockApi` operations that edit records in place. Call
   * `reindex()` afterwards if ids were added, removed, or changed.
   */
  liveRows(): Row[] {
    if (this.shared) {
      this.rows = this.rows.map(clone);
      this.shared = false;
      this.reindex();
    }
    return this.rows;
  }

  reindex(): void {
    this.index = new Map(this.rows.map((row) => [String(row[this.idKey]), row]));
  }

  /** Back to the seeded state. A store that never loaded stays unloaded (next call seeds it). */
  reset(): void {
    this.generation++;
    this.loading = undefined;
    this.queue = Promise.resolve();
    this.resetFiles?.();
    if (this.initializeFiles) {
      this.initial = undefined;
      this.rows = [];
      this.index.clear();
    } else if (this.initial) this.applyInitial();
  }

  private key(id: unknown): string {
    if ((typeof id !== "string" && typeof id !== "number") || id === "") {
      throw this.fail(
        "MOCK_INVALID_INPUT",
        `invalid ${this.idKey} ${JSON.stringify(id) ?? String(id)} (expected a non-empty string or number)`,
      );
    }
    return String(id);
  }

  private find(id: unknown): Row {
    const key = this.key(id);
    const row = this.index.get(key);
    if (!row) throw this.fail("MOCK_NOT_FOUND", `no record with ${this.idKey} "${key}"`);
    return row;
  }

  private input(value: unknown, what: string): Row {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw this.fail("MOCK_INVALID_INPUT", `${what} must be a plain object`);
    }
    let copy: Row;
    try {
      copy = clone(value as Row);
    } catch (cause) {
      throw new MockError(
        "MOCK_INVALID_INPUT",
        `${this.source.label}: ${what} must be structured-cloneable`,
        { cause },
      );
    }
    const unsafe = findUnsafeKey(copy);
    if (unsafe !== undefined) {
      throw this.fail("MOCK_INVALID_INPUT", `${what} must not contain the key "${unsafe}"`);
    }
    return copy;
  }

  private nextId(): Id {
    if (!this.numericIds) {
      throw this.fail(
        "MOCK_INVALID_INPUT",
        `create() needs "${this.idKey}": this data has non-numeric ids`,
      );
    }
    do this.counter++;
    while (this.index.has(String(this.counter)));
    return this.numberTyped ? this.counter : String(this.counter);
  }

  private assertSameId(input: Row, current: Row): void {
    if (
      input[this.idKey] !== undefined &&
      String(input[this.idKey]) !== String(current[this.idKey])
    ) {
      throw this.fail(
        "MOCK_INVALID_INPUT",
        `cannot change ${this.idKey} from "${String(current[this.idKey])}"`,
      );
    }
  }

  private insert(row: Row): Row {
    if (row[this.idKey] === undefined) row[this.idKey] = this.nextId();
    const key = this.key(row[this.idKey]);
    if (this.index.has(key))
      throw this.fail("MOCK_DUPLICATE_ID", `a record with ${this.idKey} "${key}" already exists`);
    this.rows.push(row);
    this.index.set(key, row);
    return row;
  }

  private replaceRow(current: Row, next: Row): Row {
    const i = this.rows.indexOf(current);
    this.rows[i] = next;
    this.index.set(String(current[this.idKey]), next);
    return next;
  }

  // ---- reads (each independent; none calls another public operation) ----

  /**
   * Matching rows by reference, for the engine only: callers must clone (`cloneRows`) whatever
   * they return. Lets a paginated read copy one page instead of the whole dataset.
   */
  select(query?: Record<string, unknown>): readonly Row[] {
    const entries = filterEntries(query);
    const ids = query?.id ?? query?.["id[]"];
    let rows = this.rows;
    if (ids !== undefined) {
      const wanted = new Set((Array.isArray(ids) ? ids : [ids]).map(String));
      rows = rows.filter((row) => wanted.has(String(own(row, this.idKey))));
    }
    return entries.length ? rows.filter((row) => matchesExact(row, entries)) : rows;
  }

  cloneRows(rows: readonly Row[]): Row[] {
    return rows.map(clone);
  }

  /** Exact-match filter over non-paging query keys; `id` values select those ids. */
  list(query?: Record<string, unknown>): Row[] {
    return this.cloneRows(this.select(query));
  }

  get(id: unknown): Row {
    return clone(this.find(id));
  }

  /** Requested order, missing ids omitted, duplicates collapsed. */
  getMany(ids: unknown): Row[] {
    if (!Array.isArray(ids))
      throw this.fail("MOCK_INVALID_INPUT", "getMany expects an array of ids");
    const out: Row[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const key = this.key(id);
      if (seen.has(key)) continue;
      seen.add(key);
      const row = this.index.get(key);
      if (row) out.push(clone(row));
    }
    return out;
  }

  exists(id: unknown): boolean {
    return this.index.has(this.key(id));
  }

  getBy(name: string, value: unknown): Row | null {
    const row = this.rows.find(
      (r) => own(r, name) !== undefined && String(own(r, name)) === String(value),
    );
    return row ? clone(row) : null;
  }

  findFirst(query?: Record<string, unknown>): Row | null {
    const entries = filterEntries(query);
    const row = this.rows.find((r) => matchesExact(r, entries));
    return row ? clone(row) : null;
  }

  /** Case-insensitive substring match on every given key. */
  search(query?: Record<string, unknown>): Row[] {
    return this.cloneRows(this.selectContaining(query));
  }

  /** Substring matches by reference (see `select`). */
  selectContaining(query?: Record<string, unknown>): readonly Row[] {
    const entries = filterEntries(query);
    return entries.length ? this.rows.filter((row) => matchesContains(row, entries)) : this.rows;
  }

  count(query?: Record<string, unknown>): number {
    const entries = filterEntries(query);
    return entries.length
      ? this.rows.filter((row) => matchesExact(row, entries)).length
      : this.rows.length;
  }

  // ---- writes ----

  create(body: unknown): Row {
    return clone(this.insert(this.input(body, "create() input")));
  }

  /** Validates every item first, then inserts all (no partial writes on duplicate ids). */
  createMany(bodies: unknown): Row[] {
    if (!Array.isArray(bodies))
      throw this.fail("MOCK_INVALID_INPUT", "createMany expects an array");
    const rows = bodies.map((body, i) => this.input(body, `createMany[${i}]`));
    const keys = new Set<string>();
    for (const row of rows) {
      if (row[this.idKey] === undefined) continue;
      const key = this.key(row[this.idKey]);
      if (this.index.has(key) || keys.has(key)) {
        throw this.fail("MOCK_DUPLICATE_ID", `a record with ${this.idKey} "${key}" already exists`);
      }
      keys.add(key);
    }
    // Allocate and validate the complete batch on a draft before publishing any row or counter.
    const draft = this.fork();
    const result = rows.map((row) => clone(draft.insert(row)));
    this.adopt(draft);
    return result;
  }

  update(id: unknown, body: unknown): Row {
    const changes = this.input(body, "update() input");
    const current = this.find(id);
    this.assertSameId(changes, current);
    const { [this.idKey]: _ignored, ...fields } = changes;
    return clone(this.replaceRow(current, { [this.idKey]: current[this.idKey], ...fields }));
  }

  patch(id: unknown, body: unknown): Row {
    const changes = this.input(body, "patch() input");
    const current = this.find(id);
    this.assertSameId(changes, current);
    const next: Row = { ...current };
    for (const [key, value] of Object.entries(changes)) {
      if (value !== undefined && key !== this.idKey) next[key] = value;
    }
    return clone(this.replaceRow(current, next));
  }

  /** Replace when the id exists, otherwise insert with that id. */
  upsert(id: unknown, body: unknown): Row {
    const key = this.key(id);
    const changes = this.input(body, "upsert() input");
    const current = this.index.get(key);
    if (current) {
      this.assertSameId(changes, current);
      const { [this.idKey]: _ignored, ...fields } = changes;
      return clone(this.replaceRow(current, { [this.idKey]: current[this.idKey], ...fields }));
    }
    if (changes[this.idKey] !== undefined && String(changes[this.idKey]) !== key) {
      throw this.fail("MOCK_INVALID_INPUT", `body ${this.idKey} does not match "${key}"`);
    }
    return clone(this.insert({ ...changes, [this.idKey]: id }));
  }

  delete(id: unknown): void {
    const row = this.find(id);
    this.rows.splice(this.rows.indexOf(row), 1);
    this.index.delete(String(row[this.idKey]));
  }

  /** Removes the listed ids that exist; missing ids are ignored (idempotent bulk delete). */
  deleteMany(ids: unknown): void {
    if (!Array.isArray(ids))
      throw this.fail("MOCK_INVALID_INPUT", "deleteMany expects an array of ids");
    const keys = new Set(ids.map((id) => this.key(id)));
    this.rows = this.rows.filter((row) => !keys.has(String(row[this.idKey])));
    for (const key of keys) this.index.delete(key);
  }
}
