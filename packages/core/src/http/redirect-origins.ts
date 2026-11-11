import { ConfigError } from "../errors/index.js";

/** `redirectOrigins`: exact `http(s)` origins, nothing broader (no wildcards, paths or credentials). */
export function assertRedirectOrigins(where: string, list: unknown): void {
  if (!Array.isArray(list))
    throw new ConfigError(`${where}.redirectOrigins must be an array of origins.`);
  for (const entry of list) {
    let origin: string | undefined;
    try {
      const url = new URL(String(entry));
      if (
        (url.protocol === "https:" || url.protocol === "http:") &&
        url.origin === String(entry) &&
        !String(entry).includes("*") &&
        !url.username &&
        !url.password
      )
        origin = url.origin;
    } catch {
      /* invalid */
    }
    if (origin === undefined)
      throw new ConfigError(
        `${where}.redirectOrigins entries must be exact http(s) origins such as "https://cdn.example.com" (got ${JSON.stringify(entry)}).`,
      );
  }
}
