import { MockError } from "../errors/index.js";
import { validateRecords, type MockSource, type Row } from "./source.js";

type Id = string | number;

const clone = <T>(value: T): T => structuredClone(value);

/** Exact-match filter used by list / findFirst / count. Reserved paging keys are ignored. */
const RESERVED_QUERY_KEYS = new Set(["page", "pageSize", "cursor", "id", "id[]"]);

function filterEntries(query: Record<string, unknown> | undefined): [string, unknown][] {
  if (!query) return [];
  return Object.entries(query).filter(([k, v]) => !RESERVED_QUERY_KEYS.has(k) && v !== undefined);
}

function matchesExact(row: Row, entries: [string, unknown][]): boolean {
  return entries.every(([key, value]) =>
    Array.isArray(value)
      ? value.map(String).includes(String(row[key]))
      : String(row[key]) === String(value),
  );
}

function matchesContains(row: Row, entries: [string, unknown][]): boolean {
  return entries.every(([key, value]) =>
    String(row[key] ?? "")
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
  private rows: Row[] = [];
  private index = new Map<string, Row>();
  private loading: Promise<void> | undefined;
  private numericIds = true;
  private numberTyped = true;
  /** Monotonic id counter: generated ids are never reused, even after deletes. */
  private counter = 0;

  constructor(source: MockSource) {
    this.source = source;
    this.idKey = source.idKey;
  }

  private fail(code: ConstructorParameters<typeof MockError>[0], message: string): MockError {
    return new MockError(code, `${this.source.label}: ${message}`);
  }

  /** Load + validate + seed once. Concurrent first calls share one load; a failure is retried next call. */
  ready(): Promise<void> {
    if (this.initial) return Promise.resolve();
    this.loading ??= (async () => {
      let records: readonly unknown[];
      try {
        records = await this.source.load();
        validateRecords(this.source.label, records, this.idKey);
      } catch (cause) {
        if (cause instanceof MockError) throw cause;
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new MockError(
          "MOCK_LOAD",
          `${this.source.label}: failed to load mock data — ${detail}`,
          { cause },
        );
      }
      const { limit, offset = 0 } = this.source.seed ?? {};
      const seeded = records.slice(
        offset,
        limit === undefined ? undefined : offset + limit,
      ) as Row[];
      // The source is never mutated. Inline arrays and providers can change under us, so keep a
      // private snapshot for reset. A built-in dataset is an immutable module-cached array, so
      // its (shallow) seeded slice is the reset source: only the working rows are cloned.
      this.initial = this.source.immutable ? seeded : seeded.map(clone);
      this.applyInitial();
    })().finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }

  private applyInitial(): void {
    this.rows = this.initial!.map(clone);
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
    return this.rows;
  }

  reindex(): void {
    this.index = new Map(this.rows.map((row) => [String(row[this.idKey]), row]));
  }

  /** Back to the seeded state. A store that never loaded stays unloaded (next call seeds it). */
  reset(): void {
    if (this.initial) this.applyInitial();
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
    try {
      return clone(value as Row);
    } catch (cause) {
      throw new MockError(
        "MOCK_INVALID_INPUT",
        `${this.source.label}: ${what} must be structured-cloneable`,
        { cause },
      );
    }
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

  /** Exact-match filter over non-paging query keys; `id` values select those ids. */
  list(query?: Record<string, unknown>): Row[] {
    const entries = filterEntries(query);
    const ids = query?.id ?? query?.["id[]"];
    let rows = this.rows;
    if (ids !== undefined) {
      const wanted = new Set((Array.isArray(ids) ? ids : [ids]).map(String));
      rows = rows.filter((row) => wanted.has(String(row[this.idKey])));
    }
    return (entries.length ? rows.filter((row) => matchesExact(row, entries)) : rows).map(clone);
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

  getBy(field: string, value: unknown): Row {
    const row = this.rows.find((r) => String(r[field]) === String(value));
    if (!row) throw this.fail("MOCK_NOT_FOUND", `no record with ${field} "${String(value)}"`);
    return clone(row);
  }

  findFirst(query?: Record<string, unknown>): Row | null {
    const entries = filterEntries(query);
    const row = this.rows.find((r) => matchesExact(r, entries));
    return row ? clone(row) : null;
  }

  /** Case-insensitive substring match on every given key. */
  search(query?: Record<string, unknown>): Row[] {
    const entries = filterEntries(query);
    return (
      entries.length ? this.rows.filter((row) => matchesContains(row, entries)) : this.rows
    ).map(clone);
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
    return rows.map((row) => clone(this.insert(row)));
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
