import { AbortError, MockError, fileValidationError } from "../errors/index.js";
import { containsBinary } from "../http/multipart.js";
import { validateRequestFiles, type ResolvedFileRules } from "../validation/index.js";
import {
  MockFileStorage,
  commitFiles,
  discardFiles,
  isMockFileRef,
  resetFiles,
  stageFiles,
} from "./files.js";
import { isFixtureRef, validateFixture } from "./fixtures.js";
import type { MockSource, Row } from "./source.js";
import type { MockStore } from "./store.js";
import type { MockResult } from "./execute.js";

const activeStages = new WeakMap<MockStore, Set<MockFileStorage>>();
function track(store: MockStore, stage: MockFileStorage): void {
  const stages = activeStages.get(store) ?? new Set<MockFileStorage>();
  stages.add(stage);
  activeStages.set(store, stages);
}
const isBlob = (value: unknown): value is Blob =>
  typeof Blob !== "undefined" && value instanceof Blob;
const refsIn = (rows: readonly Row[], fields: readonly string[]) =>
  rows.flatMap((row) =>
    fields.flatMap((field) => {
      const value = row[field];
      return (Array.isArray(value) ? value : [value]).filter(isMockFileRef);
    }),
  );
const fail = (message: string) => new MockError("MOCK_INVALID_INPUT", message);
function validate(body: unknown, rules?: ResolvedFileRules) {
  if (!rules) return;
  const violations = validateRequestFiles(body, rules);
  if (violations.length) throw fileValidationError(violations);
}
async function convertRow(
  row: Row,
  fields: readonly string[],
  files: MockFileStorage,
  source: MockSource,
  resource: string,
  rules?: ResolvedFileRules,
): Promise<Row> {
  validate(row, rules);
  const next = { ...row };
  for (const [field, value] of Object.entries(row)) {
    if (!fields.includes(field)) {
      if (containsBinary(value) || isFixtureRef(value))
        throw fail(`Field "${field}" is not declared in fileFields.`);
      continue;
    }
    const one = async (item: unknown): Promise<unknown> => {
      if (isBlob(item)) return (await files.put(item, { resource, field, ...source.storage })).ref;
      if (containsBinary(item) || isFixtureRef(item))
        throw fail(`Field "${field}" must contain flat files or stored references.`);
      return item;
    };
    next[field] = Array.isArray(value) ? await serialMap(value, one) : await one(value);
  }
  return next;
}
async function serialMap<T, R>(items: readonly T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (const item of items) out.push(await fn(item));
  return out;
}

/** Attach file seeding/reset to the existing lazy record loader. No loading occurs here. */
export function attachMockFiles(
  store: MockStore,
  source: MockSource,
  files: MockFileStorage,
  resource: string,
  fields: readonly string[],
  rules?: ResolvedFileRules,
): void {
  store.resetFiles = () => {
    for (const stage of activeStages.get(store) ?? []) discardFiles(stage);
    activeStages.delete(store);
    resetFiles(files, resource);
  };
  if (source.fixtures === undefined && fields.length === 0) return;
  let baseline = new Map<string, string>();
  store.initializeFiles = async (rows) => {
    const stage = stageFiles(files);
    track(store, stage);
    const cached = new Map<string, string>();
    try {
      const resolved = await serialMap(rows, async (row) => {
        const next = { ...row };

        for (const field of fields) {
          if (!Object.hasOwn(row, field)) continue;
          const resolve = async (value: unknown): Promise<unknown> => {
            if (!isFixtureRef(value)) {
              if (source.fixtures !== undefined && isMockFileRef(value) && !stage.has(value))
                throw fail("Seed file reference is missing from this client.");
              if (containsBinary(value))
                throw fail("Seed records must use fixture references, not binary values.");
              return value;
            }
            if (
              Object.keys(value).length !== 1 ||
              typeof value.$apixaFixture !== "string" ||
              !source.fixtures ||
              !Object.hasOwn(source.fixtures, value.$apixaFixture)
            )
              throw fail("Seed fixture reference is invalid or unresolved.");
            const key = value.$apixaFixture;
            let ref =
              cached.get(key) ??
              (baseline.has(key) && stage.has(baseline.get(key)!) ? baseline.get(key) : undefined);
            if (!ref) {
              const definition = source.fixtures![key]!;
              const fixture = typeof definition === "function" ? await definition() : definition;
              validateFixture(fixture);
              const content = fixture.content;
              const blob =
                isBlob(content) && (fixture.type === undefined || fixture.type === content.type)
                  ? content
                  : new Blob([content as BlobPart], { type: fixture.type ?? "" });
              ref = (
                await stage.put(blob, {
                  resource,
                  field,
                  ...source.storage,
                  name: fixture.name,
                  lastModified: fixture.lastModified ?? 0,
                })
              ).ref;
            }
            cached.set(key, ref);
            return ref;
          };
          const value = row[field];
          next[field] = Array.isArray(value)
            ? await serialMap(value, resolve)
            : await resolve(value);
        }
        // Validate the real metadata for every occurrence, including repeated fixture refs.
        const body: Row = {};
        const metadata = new Map<Blob, { name: string; size: number; type: string }>();
        for (const field of fields) {
          const toBlob = (value: unknown) => {
            if (!isMockFileRef(value)) return value;
            const meta = stage.meta(value);
            if (!meta) return value;
            const blob = new Blob([], { type: meta.type });
            metadata.set(blob, meta);
            return blob;
          };
          const value = next[field];
          body[field] = Array.isArray(value) ? value.map(toBlob) : toBlob(value);
        }
        if (rules) {
          const violations = validateRequestFiles(body, rules, metadata);
          if (violations.length) throw fileValidationError(violations);
        }
        return next;
      });
      const refs = refsIn(resolved, fields);
      return {
        rows: resolved,
        commit: () => {
          commitFiles(stage, resource, refs, [...cached.values()]);
          baseline = cached;
          activeStages.get(store)?.delete(stage);
        },
        discard: () => {
          discardFiles(stage);
          activeStages.get(store)?.delete(stage);
        },
      };
    } catch (error) {
      discardFiles(stage);
      activeStages.get(store)?.delete(stage);
      throw error;
    }
  };
}

function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    work.catch(() => undefined);
    return Promise.reject(signal.reason ?? new AbortError());
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new AbortError());
    signal.addEventListener("abort", abort, { once: true });
    work
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort))
      .catch(() => undefined);
  });
}

/** One resource transaction; the callback sees draft records and files only. */
export async function runManagedMock<T>(
  store: MockStore,
  source: MockSource,
  files: MockFileStorage,
  resource: string,
  fields: readonly string[],
  signal: AbortSignal,
  work: (draft: MockStore, staged: MockFileStorage) => Promise<MockResult>,
  prepare: (result: MockResult) => Promise<T>,
  rules?: ResolvedFileRules,
  readOnly = false,
): Promise<T> {
  const generation = store.generation;
  return abortable(
    store.exclusive(async () => {
      await abortable(store.ready(signal), signal);
      if (signal.aborted) throw signal.reason ?? new AbortError();
      if (generation !== store.generation) throw fail("Mock state was reset before execution.");
      if (readOnly) {
        const result = await work(store, files);
        const prepared = await prepare(result);
        if (signal.aborted) throw signal.reason ?? new AbortError();
        if (generation !== store.generation) throw fail("Mock state was reset before completion.");
        return prepared;
      }
      const draft = store.fork();
      const staged = stageFiles(files);
      track(store, staged);
      try {
        const result = await abortable(work(draft, staged), signal);
        if (signal.aborted) throw signal.reason ?? new AbortError();
        // Only changed rows can contain new binary values; no byte copies on ordinary reads.
        const changed = new Map<string, Row>();
        for (const row of draft.select()) {
          if (
            fields.some((field) =>
              (Array.isArray(row[field]) ? row[field] : [row[field]]).some(isFixtureRef),
            )
          )
            throw fail("Fixture markers are only supported during seed initialization.");
          if (containsBinary(row)) {
            const next = await convertRow(row, fields, staged, source, resource, rules);
            draft.patch(row[draft.idKey] as string | number, next);
            changed.set(String(row[draft.idKey]), next);
          }
        }
        const rewritten = new WeakMap<object, unknown>();
        const rewrite = (value: unknown): unknown => {
          if (isBlob(value) || value === null || typeof value !== "object") return value;
          if (rewritten.has(value)) return rewritten.get(value);
          if (
            !Array.isArray(value) &&
            Object.getPrototypeOf(value) !== Object.prototype &&
            Object.getPrototypeOf(value) !== null
          )
            return value;
          if (Array.isArray(value)) {
            const out: unknown[] = [];
            rewritten.set(value, out);
            for (const item of value) out.push(rewrite(item));
            return out;
          }
          const row = value as Row;
          const replacement = changed.get(String(row[draft.idKey]));
          const out: Row = {};
          rewritten.set(value, out);
          for (const [key, item] of Object.entries(row))
            Object.defineProperty(out, key, {
              value:
                replacement && fields.includes(key) && containsBinary(item)
                  ? replacement[key]
                  : rewrite(item),
              enumerable: true,
              writable: true,
              configurable: true,
            });
          return out;
        };
        const prepared = await prepare({
          ...result,
          data: changed.size ? rewrite(result.data) : result.data,
        });
        if (signal.aborted) throw signal.reason ?? new AbortError();
        if (generation !== store.generation) throw fail("Mock state was reset before commit.");
        commitFiles(staged, resource, refsIn(draft.select(), fields));
        store.adopt(draft);
        return prepared;
      } finally {
        discardFiles(staged);
        activeStages.get(store)?.delete(staged);
      }
    }),
    signal,
  );
}
