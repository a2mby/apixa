import type { Dataset, DatasetMeta } from "../types.js";
import { registerDatasetPreset } from "../presets/registry.js";

/** Entity type for the `users-mock` synthetic preset (first slice for typed DX). */
export type MockUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  companyId: string;
};

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

/**
 * Compact typed sample of `users-mock` for browser imports (not the full 100-row dump).
 * Full catalog remains under root `datasets/users/users-mock/`.
 */
export const data: MockUser[] = [
  {
    id: "1",
    name: "Jeremiah Turcotte",
    email: "jeremiah11@yahoo.com",
    username: "user001",
    companyId: "1",
  },
  {
    id: "2",
    name: "Timothy Wehner Sr.",
    email: "timothy.white@gmail.com",
    username: "user002",
    companyId: "2",
  },
  {
    id: "3",
    name: "Elijah Schimmel",
    email: "elijah_kilback@yahoo.com",
    username: "user003",
    companyId: "3",
  },
];

export const dataset: Dataset = {
  meta: { ...meta, records: data.length },
  records: data as unknown as Record<string, unknown>[],
};

registerDatasetPreset("users-mock", dataset);

export default data;
