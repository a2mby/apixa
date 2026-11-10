import { ConfigError, SecurityError } from "../errors/index.js";

/** Parsed, immutable `baseURL`. */
export interface BaseUrl {
  raw: string;
  /** Origin of an absolute base; `null` for a browser-relative base such as `/api`. */
  origin: string | null;
  /** Base pathname without trailing slash (`""` for a bare origin). */
  path: string;
}

const ABSOLUTE = /^https?:\/\//i;

export function isAbsoluteUrl(value: string): boolean {
  return ABSOLUTE.test(value);
}

/**
 * Accepts absolute `http(s)://host[:port][/prefix]` (any hostname — localhost, Docker service
 * names, `host.docker.internal` are treated exactly like public hosts) or a browser-relative
 * path starting with `/`. Query strings and fragments are rejected.
 */
export function parseBaseURL(value: unknown): BaseUrl {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(
      `baseURL must be a non-empty string (got ${value === "" ? '""' : typeof value}).`,
    );
  }
  if (isAbsoluteUrl(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch (cause) {
      throw new ConfigError(`baseURL "${value}" is not a valid URL.`, { cause });
    }
    if (url.search || url.hash) {
      throw new ConfigError(`baseURL "${value}" must not contain a query string or fragment.`);
    }
    return { raw: value, origin: url.origin, path: url.pathname.replace(/\/+$/, "") };
  }
  if (value.startsWith("/") && !value.startsWith("//")) {
    if (/[?#]/.test(value)) {
      throw new ConfigError(`baseURL "${value}" must not contain a query string or fragment.`);
    }
    return { raw: value, origin: null, path: value.replace(/\/+$/, "") };
  }
  throw new ConfigError(
    `baseURL "${value}" must be an absolute http(s) URL (e.g. "https://api.example.com") or a browser-relative path starting with "/" (e.g. "/api").`,
  );
}

/** The origin requests go to. Relative bases need a browser `location`; Apixa never guesses. */
export function requestOrigin(base: BaseUrl): string {
  if (base.origin) return base.origin;
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
  if (typeof origin === "string" && origin !== "null" && origin !== "") return origin;
  throw new ConfigError(
    `baseURL "${base.raw}" is relative, but this environment has no browser origin to resolve it against. ` +
      `Use an absolute URL (e.g. "http://localhost:3000${base.raw}") outside the browser.`,
  );
}

/**
 * Build the outgoing URL from an interpolated full path (`/users/1`) or an absolute same-origin
 * operation URL. Never drops or duplicates the base path prefix.
 */
export function buildUrl(
  base: BaseUrl,
  path: string,
  queryString: string,
  origin: string | null,
): string {
  if (isAbsoluteUrl(path)) return `${path}${queryString}`;
  const normalized = path === "" || path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `${origin ?? ""}${base.path}${normalized}${queryString}`;
}

/**
 * Final destination check, run after request middleware and before transport. Requests carry
 * inherited credentials, so a destination outside the API origin is refused outright.
 */
export function assertSameOrigin(url: string, origin: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url, origin);
  } catch (cause) {
    throw new SecurityError(`Request URL "${url}" is not a valid URL.`, { cause });
  }
  if (parsed.origin !== origin || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    throw new SecurityError(
      `Request URL ${parsed.href} resolves outside the API origin ${origin}; it was not sent so credentials cannot leak. ` +
        `Use a separate client (or defineApis) for another origin.`,
    );
  }
  return parsed;
}

/** Validate an explicitly delegated destination without weakening ordinary same-origin requests. */
export function validatePresignedPolicy(
  policy: import("../types/advanced-transfer.js").PresignedPolicy,
): void {
  if (
    !policy ||
    !Array.isArray(policy.origins) ||
    !policy.origins.length ||
    policy.origins.some((origin) => {
      try {
        const u = new URL(origin);
        return u.protocol !== "https:" || u.origin !== origin || !!u.username || !!u.password;
      } catch {
        return true;
      }
    }) ||
    (policy.headers !== undefined &&
      (!Array.isArray(policy.headers) ||
        policy.headers.some(
          (h) =>
            typeof h !== "string" || /^(authorization|cookie|proxy-authorization|host)$/i.test(h),
        )))
  ) {
    throw new ConfigError(
      "Presigned policy requires exact HTTPS origins and safe explicit header names.",
    );
  }
  if (
    policy.requestMiddleware !== undefined &&
    (!Array.isArray(policy.requestMiddleware) ||
      policy.requestMiddleware.some((fn) => typeof fn !== "function"))
  )
    throw new ConfigError("Invalid presigned request middleware.");
}
export function assertPresigned(
  url: string,
  policy: import("../types/advanced-transfer.js").PresignedPolicy,
  headers: Headers,
): URL {
  validatePresignedPolicy(policy);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SecurityError("Invalid presigned destination.");
  }
  if (
    parsed.protocol !== "https:" ||
    !policy.origins.includes(parsed.origin) ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    !/^https:\/\//i.test(url)
  )
    throw new SecurityError("Presigned destination is not authorized.");
  const allowed = new Set((policy.headers ?? []).map((h) => h.toLowerCase()));
  for (const key of headers.keys())
    if (
      !allowed.has(key.toLowerCase()) ||
      /^(authorization|cookie|proxy-authorization|host)$/i.test(key)
    )
      throw new SecurityError("Presigned header is not authorized.");
  return parsed;
}
