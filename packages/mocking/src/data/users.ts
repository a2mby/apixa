import type { Dataset, DatasetMeta } from "../types.js";
import { registerDatasetPreset } from "../presets/registry.js";

/** Entity type for the `users-sample` preset. */
export type User = {
  id: string;
  name: string;
  email: string;
};

const meta: DatasetMeta = {
  id: "users-sample",
  title: "Users sample",
  description: "Small directory of example users for Apixa demos.",
  license: "MIT",
  version: "1.0.0",
  resource: { path: "/users", idField: "id" },
  schema: {
    fields: [
      { name: "id", type: "string" },
      { name: "name", type: "string" },
      { name: "email", type: "string" },
    ],
  },
  records: 2,
};

/** Typed preset records (mirrors `datasets/users/users-sample/data.json`). */
export const data: User[] = [
  { id: "1", name: "Ada Lovelace", email: "ada@example.com" },
  { id: "2", name: "Grace Hopper", email: "grace@example.com" },
];

export const dataset: Dataset = {
  meta: { ...meta, records: data.length },
  records: data as unknown as Record<string, unknown>[],
};

registerDatasetPreset("users-sample", dataset);

/** Teaches Core's `mockConfig.type` this id the moment this module is imported for types. */
declare module "@apixa/core" {
  interface MockDatasetIds {
    "users-sample": true;
  }
}

export default data;
