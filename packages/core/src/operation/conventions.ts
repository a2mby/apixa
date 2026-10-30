import type { HttpMethod } from "../types/http.js";

export const CONVENTION_DEFAULTS: Record<string, { method: HttpMethod; path: string }> = {
  getAll: { method: "GET", path: "" },
  getById: { method: "GET", path: "/:id" },
  create: { method: "POST", path: "" },
  update: { method: "PUT", path: "/:id" },
  delete: { method: "DELETE", path: "/:id" },
};
