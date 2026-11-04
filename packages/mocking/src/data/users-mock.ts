import type { Dataset, DatasetMeta } from "../types.js";
import usersMockJson from "../../../../datasets/users/users-mock/data.json";

import type { MockUser } from "@apixa/core";

/** Entity type for the `users-mock` dataset (owned by Core's `MockDatasetCatalog`). */
export type { MockUser };

/** Alias used by some WIP / entity re-exports. */
export type User = MockUser;

const meta: DatasetMeta = {
  id: "users-mock",
  title: "Users (synthetic)",
  description: "Deterministic synthetic users (seed 230523).",
  license: "MIT",
  version: "1.0.0",
  resource: { path: "/users", idField: "id" },
  schema: {
    fields: [
      { name: "id", type: "string" },
      { name: "name", type: "string" },
      { name: "email", type: "string" },
      { name: "username", type: "string" },
      { name: "companyId", type: "string" },
    ],
  },
  records: 100,
};

/** Full `users-mock` records (same as root `datasets/users/users-mock/data.json`). */
export const data: MockUser[] = usersMockJson as MockUser[];

export const dataset: Dataset = {
  meta: { ...meta, records: data.length },
  records: data as unknown as Record<string, unknown>[],
};

export default data;
