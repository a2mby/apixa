import type { QueryArrayFormat } from "../types/definition.js";
import type { QueryParams } from "../types/http.js";

export function buildQueryString(query?: QueryParams, format: QueryArrayFormat = "repeat"): string {
  if (!query) return "";

  const parts: string[] = [];

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      if (format === "comma") {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value.map(String).join(","))}`);
      } else if (format === "brackets") {
        for (const item of value) {
          parts.push(`${encodeURIComponent(key)}[]=${encodeURIComponent(String(item))}`);
        }
      } else {
        for (const item of value) {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
        }
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  return parts.length ? `?${parts.join("&")}` : "";
}
