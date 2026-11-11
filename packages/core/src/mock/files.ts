import { ConfigError, MockError } from "../errors/index.js";
import { randomUUID } from "../utils/uuid.js";

export interface MockFileMeta {
  readonly id: string;
  readonly ref: string;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly lastModified: number;
  readonly createdAt: number;
  readonly resource: string;
  readonly field: string;
  /** Normalized entries always include these; optional for structural compatibility. */
  readonly disk?: string;
  readonly path?: string;
  readonly originalName?: string;
}
export interface MockStoredFile {
  readonly meta: MockFileMeta;
  bytes(): Uint8Array;
  blob(): Blob;
  text(): string;
}
export interface MockStorageOptions {
  disk?: string;
  directory?: string;
  naming?:
    | "original"
    | "unique"
    | ((file: {
        id: string;
        name: string;
        type: string;
        resource: string;
        field: string;
      }) => string);
  generateId?: () => string;
}
export interface MockFileFilter {
  resource?: string;
  field?: string;
  disk?: string;
  /** A directory or exact path; matches segment boundaries, never `a` against `ab`. */
  path?: string;
}

export async function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  if (typeof FileReader !== "undefined")
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  return new Uint8Array(await new Response(blob).arrayBuffer());
}
const REF = /^mock-file:\/\/([^/]+)(?:\/.*)?$/;
const idOf = (ref: string) => REF.exec(ref)?.[1] ?? ref;
export function isMockFileRef(value: unknown): value is string {
  return typeof value === "string" && REF.test(value);
}

/** Portable virtual path grammar, shared by configuration, puts, naming and filters. */
export function normalizeFilePath(value: string): string {
  if (
    typeof value !== "string" ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    /^(?:[/\\]|[a-z][a-z\d+.-]*:)/i.test(value) ||
    /%(?:2e|2f|5c|00|25)/i.test(value)
  ) {
    throw new ConfigError("Mock storage path must be a safe relative virtual path.");
  }
  const parts = value.replace(/\\/g, "/").split("/");
  if (parts.includes(".."))
    throw new ConfigError("Mock storage path must not contain traversal segments.");
  return parts.filter((p) => p !== "" && p !== ".").join("/");
}
export function validateStorageOptions(options: MockStorageOptions): void {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new ConfigError("mock.storage must be an options object.");
  for (const key of Object.keys(options))
    if (!["disk", "directory", "naming", "generateId"].includes(key))
      throw new ConfigError(`mock.storage has unknown option "${key}".`);
  if (
    options.disk !== undefined &&
    (typeof options.disk !== "string" || !/^[a-zA-Z0-9_-]+$/.test(options.disk))
  )
    throw new ConfigError("Mock storage disk must be a non-empty identifier.");
  if (options.directory !== undefined) normalizeFilePath(options.directory);
  if (
    options.naming !== undefined &&
    options.naming !== "original" &&
    options.naming !== "unique" &&
    typeof options.naming !== "function"
  )
    throw new ConfigError("Mock storage naming must be original, unique or a function.");
  if (options.generateId !== undefined && typeof options.generateId !== "function")
    throw new ConfigError("Mock storage generateId must be a function.");
}

type Entry = { meta: MockFileMeta; bytes: Uint8Array; manual: boolean };
type State = {
  entries: Map<string, Entry>;
  options: MockStorageOptions;
  owners: Map<string, Set<string>>;
  pins: Map<string, Set<string>>;
  reserved: Set<string>;
  stages: Set<MockFileStorage>;
  resourceEpoch: Map<string, number>;
  parent?: MockFileStorage;
  added: Set<string>;
  active: boolean;
  epoch: number;
  parentEpoch?: number;
};
const states = new WeakMap<MockFileStorage, State>();
const stateOf = (storage: MockFileStorage) => states.get(storage)!;
const rootState = (state: State): State =>
  state.parent ? rootState(stateOf(state.parent)) : state;
const pathKey = (meta: MockFileMeta) => `path:${meta.disk}:${meta.path}`;
/** Whether a virtual path is occupied; compares fields in place instead of building keys and copies per entry. */
function pathTaken(entries: Map<string, Entry>, meta: MockFileMeta): boolean {
  for (const { meta: other } of entries.values())
    if (other.path === meta.path && other.disk === meta.disk) return true;
  return false;
}
function collect(storage: MockFileStorage): void {
  const state = stateOf(storage);
  const kept = new Set([...state.owners.values(), ...state.pins.values()].flatMap((s) => [...s]));
  for (const [id, entry] of state.entries)
    if (!entry.manual && !kept.has(id)) state.entries.delete(id);
}

/** Existing client-owned in-memory storage. Bytes are copied in/out, never placed in records. */
export class MockFileStorage {
  constructor(options: MockStorageOptions = {}) {
    validateStorageOptions(options);
    states.set(this, {
      entries: new Map(),
      options: { ...options },
      owners: new Map(),
      pins: new Map(),
      reserved: new Set(),
      stages: new Set(),
      resourceEpoch: new Map(),
      added: new Set(),
      active: true,
      epoch: 0,
    });
  }
  async put(
    blob: Blob,
    info: {
      resource: string;
      field: string;
      name?: string;
      lastModified?: number;
    } & MockStorageOptions,
  ): Promise<MockFileMeta> {
    const state = stateOf(this);
    if (!state.active)
      throw new MockError("MOCK_INVALID_INPUT", "Mock file transaction is no longer active.");
    const { resource, field, name: suppliedName, lastModified: suppliedTime, ...overrides } = info;
    const options = { ...state.options, ...overrides };
    validateStorageOptions(options);
    const rootBefore = rootState(state);
    const epoch = rootBefore.epoch;
    const resourceEpoch = rootBefore.resourceEpoch.get(resource);
    let bytes: Uint8Array;
    try {
      bytes = (await readBytes(blob)).slice();
    } catch (cause) {
      throw new MockError(
        "MOCK_INVALID_INPUT",
        `Mock file storage could not read the file for field "${field}".`,
        { cause },
      );
    }
    if (!state.active)
      throw new MockError("MOCK_INVALID_INPUT", "Mock file transaction is no longer active.");
    if (rootBefore.epoch !== epoch || rootBefore.resourceEpoch.get(resource) !== resourceEpoch)
      throw new MockError("MOCK_INVALID_INPUT", "Mock storage was reset during file creation.");
    const id = options.generateId?.() ?? randomUUID("mock file storage", "no Web Crypto available");
    if (
      typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    )
      throw new ConfigError("Mock storage generateId must return a UUID.");
    const original =
      suppliedName ??
      (typeof File !== "undefined" && blob instanceof File && blob.name ? blob.name : "blob");
    const name =
      typeof options.naming === "function"
        ? options.naming({ id, name: original, type: blob.type, resource, field })
        : options.naming === "unique"
          ? `${id}${/\.[a-z0-9]+$/i.exec(original)?.[0] ?? ""}`
          : original;
    const explicitName = options.naming !== undefined && options.naming !== "original";
    if (typeof name !== "string" || !name)
      throw new ConfigError("Mock storage naming must return a non-empty filename.");
    let safeName: string;
    if (explicitName) {
      safeName = normalizeFilePath(name);
      if (safeName !== name || safeName.includes("/"))
        throw new ConfigError("Mock storage naming must return one safe filename segment.");
    } else {
      // Preserve legacy display names, but never interpret them as virtual paths.
      safeName = name.replace(/[\u0000-\u001f\u007f/\\:%]/g, "_");
      if (safeName === "." || safeName === "..") safeName = "blob";
    }
    const directory = options.directory === undefined ? id : normalizeFilePath(options.directory);
    const path = directory ? `${directory}/${safeName}` : safeName;
    const meta: MockFileMeta = Object.freeze({
      id,
      ref: `mock-file://${id}/${encodeURIComponent(name)}`,
      name,
      type: blob.type,
      size: bytes.byteLength,
      lastModified:
        suppliedTime ??
        (typeof File !== "undefined" && blob instanceof File ? blob.lastModified : Date.now()),
      createdAt: Date.now(),
      resource,
      field,
      disk: options.disk ?? "default",
      path,
      ...(name !== original ? { originalName: original } : {}),
    });
    const root = rootState(state);
    if (
      root.entries.has(id) ||
      root.reserved.has(id) ||
      pathTaken(root.entries, meta) ||
      root.reserved.has(pathKey(meta))
    )
      throw new MockError(
        "MOCK_DUPLICATE_ID",
        "Mock file identifier or virtual path already exists.",
      );
    if (state.parent) {
      root.reserved.add(id);
      root.reserved.add(pathKey(meta));
      state.added.add(id);
    }
    state.entries.set(id, { meta, bytes, manual: !state.parent });
    return meta;
  }
  has(ref: string): boolean {
    return stateOf(this).entries.has(idOf(ref));
  }
  meta(ref: string): MockFileMeta | undefined {
    return stateOf(this).entries.get(idOf(ref))?.meta;
  }
  get(ref: string): MockStoredFile | undefined {
    const entry = stateOf(this).entries.get(idOf(ref));
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
  list(filter?: MockFileFilter): MockFileMeta[] {
    const path = filter?.path === undefined ? undefined : normalizeFilePath(filter.path);
    if (filter?.disk !== undefined) validateStorageOptions({ disk: filter.disk });
    const out: MockFileMeta[] = [];
    for (const { meta } of stateOf(this).entries.values())
      if (
        (filter?.resource === undefined || meta.resource === filter.resource) &&
        (filter?.field === undefined || meta.field === filter.field) &&
        (filter?.disk === undefined || meta.disk === filter.disk) &&
        (path === undefined ||
          path === "" ||
          meta.path === path ||
          meta.path?.startsWith(`${path}/`))
      )
        out.push(meta);
    return out;
  }
  delete(ref: string): boolean {
    const state = stateOf(this);
    const deleted = state.entries.delete(idOf(ref));
    if (deleted) state.epoch++;
    return deleted;
  }
  clear(resource?: string): void {
    const state = stateOf(this);
    state.epoch++;
    for (const stage of [...state.stages]) discardFiles(stage);
    for (const [id, entry] of state.entries)
      if (resource === undefined || entry.meta.resource === resource) state.entries.delete(id);
  }
  get size(): number {
    return stateOf(this).entries.size;
  }
}

// Engine-only staging and ownership functions; not exported from any public entry.
export function stageFiles(parent: MockFileStorage): MockFileStorage {
  const stage = new MockFileStorage();
  const state = stateOf(stage);
  const base = stateOf(parent);
  state.entries = new Map(base.entries);
  state.parent = parent;
  state.options = base.options;
  state.parentEpoch = base.epoch;
  rootState(base).stages.add(stage);
  return stage;
}
export function discardFiles(stage: MockFileStorage): void {
  const state = stateOf(stage);
  if (!state.active) return;
  const root = rootState(state);
  for (const id of state.added) {
    root.reserved.delete(id);
    const entry = state.entries.get(id);
    if (entry) root.reserved.delete(pathKey(entry.meta));
  }
  root.stages.delete(stage);
  state.active = false;
  state.entries.clear();
  state.added.clear();
}
export function commitFiles(
  stage: MockFileStorage,
  resource: string,
  refs: readonly string[],
  pins?: readonly string[],
): void {
  const state = stateOf(stage);
  const parent = stateOf(state.parent!);
  if (!state.active || parent.epoch !== state.parentEpoch)
    throw new MockError("MOCK_INVALID_INPUT", "Mock storage changed before commit.");
  const restore = new Map<string, Entry>();
  for (const ref of refs) {
    const id = idOf(ref);
    const entry = state.entries.get(id);
    if (!parent.entries.has(id) && entry && !state.added.has(id)) {
      if (pathTaken(parent.entries, entry.meta))
        throw new MockError(
          "MOCK_DUPLICATE_ID",
          "Referenced mock file path was replaced before commit.",
        );
      restore.set(id, entry);
    }
  }
  for (const [id, entry] of restore) parent.entries.set(id, entry);
  for (const id of state.added) parent.entries.set(id, state.entries.get(id)!);
  parent.owners.set(resource, new Set(refs.map(idOf)));
  if (pins) parent.pins.set(resource, new Set(pins.map(idOf)));
  discardFiles(stage);
  collect(state.parent!);
}
export function resetFiles(storage: MockFileStorage, resource: string): void {
  const state = stateOf(storage);
  state.resourceEpoch.set(resource, (state.resourceEpoch.get(resource) ?? 0) + 1);
  state.owners.delete(resource);
  state.pins.delete(resource);
  const kept = new Set([...state.owners.values(), ...state.pins.values()].flatMap((s) => [...s]));
  for (const [id, entry] of state.entries)
    if (entry.meta.resource === resource && !kept.has(id)) state.entries.delete(id);
  collect(storage);
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
