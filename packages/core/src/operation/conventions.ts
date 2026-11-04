import type { HttpMethod } from "../types/http.js";

export type ConventionDefault = { method: HttpMethod; path: string; hasBody?: boolean };

export const CONVENTION_DEFAULTS: Record<string, ConventionDefault> = {
  getAll: { method: "GET", path: "" },
  getById: { method: "GET", path: "/:id" },
  create: { method: "POST", path: "" },
  update: { method: "PUT", path: "/:id" },
  delete: { method: "DELETE", path: "/:id" },
};

/**
 * Always-on conventions (v0.10.0) — the same default-first treatment as `CONVENTION_DEFAULTS`
 * above, since v0.2.0. No `operations` entry is needed to use one of these; `false` removes it.
 * Kept in a separate table only so the original 5 stay visibly untouched.
 */
export const EXTENDED_CONVENTION_DEFAULTS: Record<string, ConventionDefault> = {
  getBySlug: { method: "GET", path: "/slug/:slug" },
  patch: { method: "PATCH", path: "/:id" },
  upsert: { method: "PUT", path: "/:id" },
  count: { method: "GET", path: "/count" },
  search: { method: "GET", path: "/search" },
  bulkCreate: { method: "POST", path: "/bulk" },
  bulkDelete: { method: "DELETE", path: "/bulk", hasBody: true },
};
