import { MockError } from "../errors/index.js";
import { randomUUID } from "../utils/uuid.js";

/** Metadata of one stored mock file. Immutable snapshot. */
export interface MockFileMeta {
  readonly id: string;
  /** The string stored in mocked records: `mock-file://<id>/<name>`. */
  readonly ref: string;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly lastModified: number;
  readonly createdAt: number;
  /** `resources` key whose write stored the file. */
  readonly resource: string;
  /** File field it was uploaded for. */
  readonly field: string;
}

/** A retrieved file: metadata plus fresh copies of the bytes on every read. */
export interface MockStoredFile {
  readonly meta: MockFileMeta;
  bytes(): Uint8Array;
  blob(): Blob;
  text(): string;
}

/** `Blob.arrayBuffer()`, with `FileReader` for older engines / DOM shims that lack it. */
export async function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }
  return new Uint8Array(await new Response(blob).arrayBuffer());
}

const REF = /^mock-file:\/\/([^/]+)(?:\/.*)?$/;

/** True for a string produced by the mock file store. */
export function isMockFileRef(value: unknown): value is string {
  return typeof value === "string" && REF.test(value);
}

/**
 * Virtual in-memory file storage shared by a client's mocked resources. Bytes are copied in and
 * kept apart from dataset records (records hold only string references). It never creates object
 * URLs and holds no reference to the caller's `Blob`; it works in browsers and Node.
 */
export class MockFileStorage {
  readonly #files = new Map<string, { meta: MockFileMeta; bytes: Uint8Array }>();

  /** Copy a `Blob` / `File` into storage. */
  async put(blob: Blob, info: { resource: string; field: string }): Promise<MockFileMeta> {
    let bytes: Uint8Array;
    try {
      bytes = await readBytes(blob);
    } catch (cause) {
      throw new MockError(
        "MOCK_INVALID_INPUT",
        `Mock file storage could not read the file for field "${info.field}".`,
        { cause },
      );
    }
    const id = randomUUID("mock file storage", "no Web Crypto available");
    const name =
      typeof File !== "undefined" && blob instanceof File && blob.name ? blob.name : "blob";
    const meta: MockFileMeta = Object.freeze({
      id,
      ref: `mock-file://${id}/${encodeURIComponent(name)}`,
      name,
      type: blob.type,
      size: bytes.byteLength,
      lastModified:
        typeof File !== "undefined" && blob instanceof File ? blob.lastModified : Date.now(),
      createdAt: Date.now(),
      resource: info.resource,
      field: info.field,
    });
    this.#files.set(id, { meta, bytes });
    return meta;
  }

  #idOf(refOrId: string): string {
    return REF.exec(refOrId)?.[1] ?? refOrId;
  }

  has(refOrId: string): boolean {
    return this.#files.has(this.#idOf(refOrId));
  }

  meta(refOrId: string): MockFileMeta | undefined {
    return this.#files.get(this.#idOf(refOrId))?.meta;
  }

  get(refOrId: string): MockStoredFile | undefined {
    const entry = this.#files.get(this.#idOf(refOrId));
    if (!entry) return undefined;
    const { meta, bytes } = entry;
    const copy = () => bytes.slice();
    return {
      meta,
      bytes: copy,
      blob: () =>
        typeof File !== "undefined"
          ? new File([copy()], meta.name, { type: meta.type, lastModified: meta.lastModified })
          : new Blob([copy()], { type: meta.type }),
      text: () => new TextDecoder().decode(bytes),
    };
  }

  list(filter?: { resource?: string; field?: string }): MockFileMeta[] {
    return [...this.#files.values()]
      .map((entry) => entry.meta)
      .filter(
        (meta) =>
          (filter?.resource === undefined || meta.resource === filter.resource) &&
          (filter?.field === undefined || meta.field === filter.field),
      );
  }

  /** Remove one file. Returns whether it existed. */
  delete(refOrId: string): boolean {
    return this.#files.delete(this.#idOf(refOrId));
  }

  /** Remove every file, or only those stored for one resource. */
  clear(resource?: string): void {
    if (resource === undefined) return void this.#files.clear();
    for (const meta of this.list({ resource })) this.#files.delete(meta.id);
  }

  get size(): number {
    return this.#files.size;
  }
}

// ---- mocked binary responses ----

const textEncoder = new TextEncoder();

/** `attachment; filename="…"` (+ `filename*` for non-ASCII), the header a real download carries. */
function contentDispositionFor(name: string): string {
  // eslint-disable-next-line no-control-regex
  const ascii = /^[\u0020-\u007e]*$/.test(name) && !/["\\]/.test(name);
  if (ascii) return `attachment; filename="${name}"`;
  const fallback = name.replace(/[^\u0020-\u007e]|["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function isBinary(value: unknown): value is Blob | ArrayBuffer | Uint8Array {
  return (
    (typeof Blob !== "undefined" && value instanceof Blob) ||
    value instanceof ArrayBuffer ||
    value instanceof Uint8Array
  );
}

async function bytesOf(value: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return readBytes(value);
}

const exactBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

/**
 * Makes a mocked result look like the live response for `responseType` (JSON data is serialized
 * the way a server would send it) and returns the headers a real response would carry
 * (`Content-Type`, `Content-Length`, and `Content-Disposition` for a `File`). Empty (`null`) data
 * is the typed empty value, as for HTTP 204.
 */
export async function finalizeMockResponse(
  data: unknown,
  responseType: "json" | "text" | "blob" | "arrayBuffer",
): Promise<{ data: unknown; headers: Headers }> {
  const headers = new Headers();
  if (data === null || data === undefined) {
    if (responseType === "text") return { data: "", headers };
    if (responseType === "blob") return { data: new Blob([]), headers };
    if (responseType === "arrayBuffer") return { data: new ArrayBuffer(0), headers };
    return { data: data ?? null, headers };
  }
  let bytes: Uint8Array | undefined;
  let type = "";
  if (isBinary(data)) {
    bytes = await bytesOf(data);
    type = data instanceof Blob ? data.type : "";
    if (typeof File !== "undefined" && data instanceof File && data.name) {
      headers.set("content-disposition", contentDispositionFor(data.name));
    }
    headers.set("content-type", type || "application/octet-stream");
  } else if (typeof data === "string") {
    if (responseType === "json") return { data, headers };
    bytes = textEncoder.encode(data);
    headers.set("content-type", "text/plain;charset=UTF-8");
  } else {
    if (responseType === "json") return { data, headers };
    bytes = textEncoder.encode(JSON.stringify(data));
    headers.set("content-type", "application/json");
  }
  headers.set("content-length", String(bytes.byteLength));
  switch (responseType) {
    case "text":
      return { data: new TextDecoder().decode(bytes), headers };
    case "arrayBuffer":
      return { data: exactBuffer(bytes), headers };
    case "blob":
      return {
        data:
          data instanceof Blob
            ? data
            : new Blob([bytes as BlobPart], { type: headers.get("content-type") ?? "" }),
        headers,
      };
    default:
      return { data, headers };
  }
}
