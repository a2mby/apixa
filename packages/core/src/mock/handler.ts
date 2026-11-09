import { AbortError, MockError } from "../errors/index.js";
import type { MockStore } from "./store.js";
import type { Row } from "./source.js";
import type { MockResult } from "./execute.js";
import type { MockFileFilter, MockFileMeta, MockFileStorage, MockStoredFile } from "./files.js";

/**
 * What a custom operation's `mock` handler receives. Typed precisely in `types/mock-handler.ts`;
 * this is the runtime shape. `records` is a lazy snapshot: nothing is copied unless it is read.
 */
export interface MockHandlerContext {
  readonly records: readonly Row[];
  readonly store: MockStoreHandle;
  readonly params: Record<string, unknown>;
  readonly query: Record<string, unknown>;
  readonly body: unknown;
  readonly signal: AbortSignal;
  /** Read-only view of the client's virtual file store (see `mockFiles(api)`). */
  readonly files: MockFilesHandle;
  readonly resource: string;
  readonly operation: string;
}

/** What a handler may do with the client's virtual files: read them. A missing file is `MOCK_NOT_FOUND`. */
export interface MockFilesHandle {
  /** Whether a reference (`mock-file://…`) or file id is stored. */
  has(ref: string): boolean;
  meta(ref: string): MockFileMeta;
  get(ref: string): MockStoredFile;
  list(filter?: MockFileFilter): MockFileMeta[];
}

type Id = string | number;

/** The only way a handler touches records: the resource's own store, through copies. */
export interface MockStoreHandle {
  get(id: Id): Row;
  exists(id: Id): boolean;
  list(query?: Record<string, unknown>): Row[];
  create(input: Row): Row;
  update(id: Id, input: Row): Row;
  patch(id: Id, input: Row): Row;
  delete(id: Id): void;
}

function createStoreHandle(store: MockStore): MockStoreHandle {
  const handle: MockStoreHandle = {
    get: (id) => store.get(id),
    exists: (id) => store.exists(id),
    list: (query) => store.list(query),
    create: (input) => store.create(input),
    update: (id, input) => store.update(id, input),
    patch: (id, input) => store.patch(id, input),
    delete: (id) => store.delete(id),
  };
  return Object.freeze(handle);
}

function createFilesHandle(storage: MockFileStorage): MockFilesHandle {
  const missing = (ref: string) =>
    new MockError(
      "MOCK_NOT_FOUND",
      `Mock file ${JSON.stringify(ref)} is not in the virtual file store.`,
    );
  const handle: MockFilesHandle = {
    has: (ref) => storage.has(ref),
    meta: (ref) => storage.meta(ref) ?? raise(missing(ref)),
    get: (ref) => storage.get(ref) ?? raise(missing(ref)),
    list: (filter) => storage.list(filter),
  };
  return Object.freeze(handle);
}

function raise(error: Error): never {
  throw error;
}

export interface HandlerCall {
  resource: string;
  operation: string;
  method: string;
  params: Record<string, unknown>;
  query: Record<string, unknown> | undefined;
  body: unknown;
  signal: AbortSignal;
  files: MockFileStorage;
}

/**
 * Run a custom declarative operation's `mock` handler against the resource's store.
 *
 * Cancellation: the call rejects as soon as the signal aborts, but a handler that has already
 * started may keep running. Its draft is discarded and late managed writes are rejected. External
 * user side effects are outside the managed transaction.
 */
export async function runMockHandler(
  handler: (context: MockHandlerContext) => unknown,
  store: MockStore,
  call: HandlerCall,
): Promise<MockResult> {
  await store.ready();
  if (call.signal.aborted) throw call.signal.reason ?? new AbortError();
  let active = true;
  const rawHandle = createStoreHandle(store);
  const handle = Object.freeze(
    Object.fromEntries(
      Object.entries(rawHandle).map(([key, fn]) => [
        key,
        (...args: unknown[]) => {
          if (!active)
            throw new MockError("MOCK_INVALID_INPUT", "Mock handler transaction has finished.");
          if (call.signal.aborted) throw call.signal.reason ?? new AbortError();
          return (fn as (...args: unknown[]) => unknown)(...args);
        },
      ]),
    ),
  ) as unknown as MockStoreHandle;
  const context: MockHandlerContext = {
    get records() {
      return store.list();
    },
    store: handle,
    params: { ...call.params },
    query: { ...(call.query ?? {}) },
    body: call.body,
    signal: call.signal,
    files: createFilesHandle(call.files),
    resource: call.resource,
    operation: call.operation,
  };
  const pending = Promise.resolve().then(() => handler(context));
  let data: unknown;
  try {
    data = await raceAbort(pending, call.signal);
  } finally {
    active = false;
  }
  const noContent = call.method === "DELETE" && (data === undefined || data === null);
  return { status: noContent ? 204 : 200, data: noContent ? null : data };
}

function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    work.catch(() => undefined);
    return Promise.reject(signal.reason ?? new AbortError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new AbortError());
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
