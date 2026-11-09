/**
 * Mock behavior for a custom declarative operation:
 *
 * ```ts
 * getActive: { kind: "read", method: "GET", path: "/active", mock: ({ records }) => records.filter((u) => u.active) }
 * ```
 *
 * The handler runs only when the resource is mocked (`mock: …` on the resource). On a live resource
 * the operation is an ordinary HTTP request and the handler is never called.
 */
import type { MockFilesHandle } from "../mock/handler.js";

export type { MockFilesHandle };

type Id = string | number;

/**
 * The resource's own records, reached through copies: nothing returned from here is the store's
 * object, so editing a result never edits the store. Each client has its own store.
 */
export interface MockStoreHandle<E extends object> {
  /** One record, or rejects with `MOCK_NOT_FOUND`. */
  get(id: Id): E;
  exists(id: Id): boolean;
  /** Records whose fields equal every given value (an array value means "any of"). */
  list(query?: Partial<E>): E[];
  /** Appends. A missing id is generated; a taken id rejects with `MOCK_DUPLICATE_ID`. */
  create(input: Partial<E>): E;
  /** Replaces the record, keeping its id. */
  update(id: Id, input: Partial<E>): E;
  /** Merges the given fields. */
  patch(id: Id, input: Partial<E>): E;
  /** Removes the record, or rejects with `MOCK_NOT_FOUND`. */
  delete(id: Id): void;
}

export interface OperationMockContext<E extends object, Params, Query, Body> {
  /**
   * A snapshot copy of every record, taken when you first read this property. Reading it copies the
   * whole resource, so prefer `store.list(query)` for a large filtered read, and ignore it when you
   * only write. Editing the snapshot does not change the store.
   */
  readonly records: readonly E[];
  readonly store: MockStoreHandle<E>;
  /** Path parameters of the operation (and of the resource path). */
  readonly params: Params;
  /** The request query as the mock engine sees it (after request middleware and key transforms). */
  readonly query: Query;
  /** The request body as the mock engine sees it (after request middleware and key transforms). */
  readonly body: Body;
  /**
   * Aborts on cancellation or timeout. The call rejects at once, but a handler already running
   * may keep running. Managed writes are rolled back/revoked; external user side effects are not.
   */
  readonly signal: AbortSignal;
  /**
   * Read-only view of the client's virtual file store: serve a previously uploaded file by its
   * reference (`files.get(record.file).blob()`). A missing file is `MOCK_NOT_FOUND`.
   */
  readonly files: MockFilesHandle;
  readonly resource: string;
  readonly operation: string;
}

export type OperationMockHandler<E extends object, Params, Query, Body, Result> = (
  context: OperationMockContext<E, Params, Query, Body>,
) => Result | Promise<Result>;
