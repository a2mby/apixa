import type { MockStorageOptions } from "./files.js";
import { validateStorageOptions } from "./files.js";
import { validateFixture, type MockFileFixtures } from "./fixtures.js";
import { ConfigError } from "../errors/index.js";
import {
  isMockDatasetId,
  listMockDatasetIds,
  loadNamedDataset,
  MOCK_DATASETS,
} from "./datasets.js";

export type Row = Record<string, unknown>;

/** Normalized, validated mock data source for one resource. */
export interface MockSource {
  label: string;
  idKey: string;
  /** Inline records are available synchronously; providers / datasets load on demand. */
  load: () => readonly unknown[] | Promise<readonly unknown[]>;
  seed?: { limit?: number; offset?: number };
  /**
   * The records are an immutable, module-cached built-in dataset that nothing else mutates, so
   * the store may keep references to it as its reset source instead of a private cloned snapshot.
   */
  immutable?: boolean;
  storage?: MockStorageOptions;
  fixtures?: MockFileFixtures;
}

const MOCK_OBJECT_KEYS = new Set(["data", "idKey", "seed", "storage", "fixtures"]);
const SEED_KEYS = new Set(["limit", "offset"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function describe(value: unknown): string {
  return Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
}

/** Validate a `mock` value at client construction. Throws `ConfigError` naming the resource. */
export function normalizeMockSource(resource: string, value: unknown): MockSource {
  const label = `resources.${resource}.mock`;
  let data: unknown = value;
  let idKey: string | undefined;
  let seed: MockSource["seed"];
  const extras: Pick<MockSource, "storage" | "fixtures"> = {};

  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (!MOCK_OBJECT_KEYS.has(key)) {
        throw new ConfigError(
          `${label} has unknown option "${key}". Supported: data, idKey, seed. ` +
            `Operation behavior belongs in resources.${resource}.operations, not in mock.`,
        );
      }
    }
    if (!("data" in value)) throw new ConfigError(`${label} object needs a "data" source.`);
    data = value.data;
    if (value.idKey !== undefined) {
      if (typeof value.idKey !== "string" || value.idKey === "") {
        throw new ConfigError(`${label}.idKey must be a non-empty string.`);
      }
      idKey = value.idKey;
    }
    if (value.seed !== undefined) seed = normalizeSeed(label, value.seed);
    if (value.storage !== undefined) {
      validateStorageOptions(value.storage as MockStorageOptions);
      extras.storage = { ...(value.storage as MockStorageOptions) };
    }
    if (value.fixtures !== undefined) {
      if (!isPlainObject(value.fixtures) || Array.isArray(value.fixtures))
        throw new ConfigError(`${label}.fixtures must be a registry object.`);
      for (const [key, fixture] of Object.entries(value.fixtures)) {
        if (!key) throw new ConfigError(`${label}.fixtures keys must be non-empty.`);
        if (typeof fixture !== "function") validateFixture(fixture);
      }
      extras.fixtures = value.fixtures as MockFileFixtures;
    }
  }

  if (typeof data === "string") {
    if (!isMockDatasetId(data)) {
      throw new ConfigError(
        `${label}: unknown dataset "${data}". Available: ${listMockDatasetIds().join(", ")}.`,
      );
    }
    const id = data;
    const datasetIdKey = MOCK_DATASETS[id];
    if (idKey !== undefined && idKey !== datasetIdKey) {
      throw new ConfigError(
        `${label}.idKey "${idKey}" does not match dataset "${id}" (uses "${datasetIdKey}").`,
      );
    }
    return {
      ...extras,
      label,
      idKey: datasetIdKey,
      load: () => loadNamedDataset(id),
      seed,
      immutable: true,
    };
  }

  if (Array.isArray(data)) {
    const records = data as readonly unknown[];
    const key = idKey ?? "id";
    validateRecords(label, records, key);
    return { ...extras, label, idKey: key, load: () => records, seed };
  }

  if (typeof data === "function") {
    const provider = data as () => unknown;
    return {
      ...extras,
      label,
      idKey: idKey ?? "id",
      seed,
      load: () => {
        const result = provider();
        return typeof (result as { then?: unknown } | null)?.then === "function"
          ? Promise.resolve(result).then((records) => assertArray(label, records))
          : assertArray(label, result);
      },
    };
  }

  if (typeof value === "boolean") {
    throw new ConfigError(
      `${label} must be a dataset id, an array of records, a provider function, or { data, idKey?, seed? } ` +
        `(got ${String(value)}). mock: true was removed — use mock: "<dataset-id>".`,
    );
  }
  throw new ConfigError(
    `${label} must be a dataset id, an array of records, a provider function, or { data, idKey?, seed? } (got ${describe(data)}).`,
  );
}

function normalizeSeed(label: string, value: unknown): NonNullable<MockSource["seed"]> {
  if (!isPlainObject(value)) throw new ConfigError(`${label}.seed must be { limit?, offset? }.`);
  for (const key of Object.keys(value)) {
    if (!SEED_KEYS.has(key))
      throw new ConfigError(`${label}.seed has unknown option "${key}". Supported: limit, offset.`);
  }
  const seed: NonNullable<MockSource["seed"]> = {};
  for (const key of ["limit", "offset"] as const) {
    const n = value[key];
    if (n === undefined) continue;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
      throw new ConfigError(
        `${label}.seed.${key} must be a non-negative integer (got ${String(n)}).`,
      );
    }
    seed[key] = n;
  }
  return seed;
}

function assertArray(label: string, records: unknown): readonly unknown[] {
  if (!Array.isArray(records)) {
    throw new ConfigError(
      `${label} provider must return an array of records (got ${describe(records)}).`,
    );
  }
  return records;
}

/** Every record is a plain object with a unique string/number identity. */
export function validateRecords(label: string, records: readonly unknown[], idKey: string): void {
  const seen = new Set<string>();
  records.forEach((record, i) => {
    if (!isPlainObject(record)) {
      throw new ConfigError(`${label}[${i}] must be a plain object (got ${describe(record)}).`);
    }
    const id = record[idKey];
    if ((typeof id !== "string" && typeof id !== "number") || id === "") {
      throw new ConfigError(
        `${label}[${i}] is missing identity field "${idKey}" (string or number).`,
      );
    }
    const key = String(id);
    if (seen.has(key)) throw new ConfigError(`${label}: duplicate ${idKey} "${key}".`);
    seen.add(key);
  });
}
