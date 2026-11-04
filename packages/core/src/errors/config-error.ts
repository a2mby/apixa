import { ApiError } from "./api-error.js";

/** Invalid configuration, raised when the client is built (or when a call cannot be resolved). */
export class ConfigError extends ApiError {
  constructor(message: string, options?: ConstructorParameters<typeof ApiError>[1]) {
    super(message, { code: "CONFIG", retryable: false, ...options });
    this.name = "ConfigError";
  }
}
