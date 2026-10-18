/** Lightweight field summary for dataset catalogs (not a runtime validator). */
export interface DatasetFieldSchema {
  name: string;
  type: string;
}

export interface DatasetSchema {
  fields: DatasetFieldSchema[];
}

export interface DatasetResourceHint {
  /** Resource collection path, e.g. `/users`. */
  path: string;
  /** Record identity field (default `id`). */
  idField?: string;
}

/**
 * Dataset metadata — minimum catalog fields for local Simple Mocking.
 * A future online catalog can reuse this shape.
 */
export interface DatasetMeta {
  id: string;
  title: string;
  description?: string;
  license: string;
  version: string;
  resource: DatasetResourceHint;
  schema: DatasetSchema;
  /** Declared record count; loaders may overwrite from `data.json` length. */
  records: number;
}

export interface Dataset {
  meta: DatasetMeta;
  records: Record<string, unknown>[];
}

export interface DatasetListItem {
  id: string;
  title: string;
  description?: string;
  license: string;
  version: string;
  records: number;
  resourcePath: string;
  /** Relative path under the datasets root, e.g. `geography/countries-csc`. */
  path?: string;
}
