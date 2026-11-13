import { MockError } from "../errors/index.js";
import { containsBinary } from "../http/multipart.js";
import { MockFileStorage } from "./files.js";
import { runBuiltin, type BuiltinIntent, type MockResult, type PaginationMode } from "./execute.js";
import type { MockSource, Row } from "./source.js";
import type { MockStore } from "./store.js";

const isBlob = (value: unknown): value is Blob =>
  typeof Blob !== "undefined" && value instanceof Blob;

function isRow(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isBlob(value);
}

const WRITES = new Set(["create", "createMany", "update", "patch"]);

/**
 * Convert one builtin body on the engine's private record/file drafts. The enclosing managed
 * transaction owns publication, reference cleanup and rollback (including reserved virtual paths).
 */
export async function runMockWithFiles(
  store: MockStore,
  source: MockSource,
  intent: BuiltinIntent,
  pagination: PaginationMode | undefined,
  files: MockFileStorage,
  fileFields: readonly string[],
  call: { resource: string; signal: AbortSignal },
): Promise<MockResult> {
  const fields = new Set(fileFields);
  const isDelete = intent.op === "delete" || intent.op === "deleteMany";
  if (!(WRITES.has(intent.op) || isDelete)) return runBuiltin(store, source, intent, pagination);

  await store.ready();
  const fail = (message: string) =>
    new MockError("MOCK_INVALID_INPUT", `${source.label}: ${message}`);

  const stageValue = async (field: string, value: unknown): Promise<unknown> => {
    if (isBlob(value)) {
      const meta = await files.put(value, { resource: call.resource, field, ...source.storage });
      return meta.ref;
    }
    if (Array.isArray(value) && value.some(isBlob)) {
      const out: unknown[] = [];
      for (const item of value) out.push(isBlob(item) ? await stageValue(field, item) : item);
      return out;
    }
    return value;
  };

  const stageRow = async (row: unknown): Promise<unknown> => {
    if (!isRow(row)) return row;
    const next: Row = { ...row };
    for (const [key, value] of Object.entries(row)) {
      if (fields.has(key)) {
        next[key] = await stageValue(key, value);
        if (containsBinary(next[key])) {
          throw fail(
            `field "${key}" holds nested binary values; file fields take a File, a Blob, or an array of them.`,
          );
        }
      } else if (containsBinary(value)) {
        throw fail(`field "${key}" holds binary values but is not declared in fileFields.`);
      }
      if (call.signal.aborted) throw call.signal.reason;
    }
    return next;
  };

  let body = intent.body;
  if (intent.op === "createMany" && Array.isArray(body)) {
    const rows: unknown[] = [];
    for (const item of body) rows.push(await stageRow(item));
    body = rows;
  } else if (WRITES.has(intent.op)) {
    body = await stageRow(body);
  }

  if (call.signal.aborted) throw call.signal.reason;
  return await runBuiltin(store, source, { ...intent, body }, pagination);
}
