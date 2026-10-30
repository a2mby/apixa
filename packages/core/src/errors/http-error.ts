import { ApiError } from "./api-error.js";

export class HttpError<D = unknown> extends ApiError {
  declare data?: D;

  constructor(
    message: string,
    options: NonNullable<ConstructorParameters<typeof ApiError>[1]> & {
      status: number;
      data?: D;
    },
  ) {
    super(message, { code: "HTTP", retryable: false, ...options });
    this.name = "HttpError";
  }
}
