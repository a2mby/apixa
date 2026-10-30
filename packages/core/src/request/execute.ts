import { ApiError, HttpError } from "../errors/index.js";
import {
  buildQueryString,
  createTimeoutSignal,
  interpolatePath,
  joinURL,
  mergeHeaders,
  serializeBody,
} from "../http/index.js";
import type {
  ResolvedApiConfig,
  ResolvedOperation,
  ResolvedResourceConfig,
} from "../types/definition.js";
import type { PathParams, QueryParams } from "../types/http.js";
import type { ResolvedRetryConfig } from "../types/retry.js";
import type {
  ApiResponse,
  RequestConfig,
  RequestOptions,
  ResponseType,
} from "../types/transport.js";
import { classifyRequestError, isAbortLike, isTimeoutLike } from "./classify-error.js";
import { composeMiddleware } from "./middleware.js";
import { computeRetryDelayMs, decideRetry, delay, resolveRetryConfig } from "./retry.js";

export interface ExecuteArgs {
  params?: PathParams;
  query?: QueryParams;
  body?: unknown;
  headers?: RequestOptions["headers"];
  signal?: AbortSignal;
  timeout?: number;
  retry?: RetryConfigOrFalse;
  responseType?: ResponseType;
  meta?: Record<string, unknown>;
  full?: boolean;
}

type RetryConfigOrFalse = RequestOptions["retry"];

export async function executeRequest<TData>(
  api: ResolvedApiConfig,
  resource: ResolvedResourceConfig,
  operation: ResolvedOperation,
  call: ExecuteArgs = {},
): Promise<TData | ApiResponse<TData>> {
  const path = interpolatePath(operation.path, call.params);
  const querySuffix = api.querySerializer
    ? api.querySerializer(call.query ?? {})
    : buildQueryString(call.query, api.queryArrayFormat ?? "repeat");
  const qs =
    !querySuffix || querySuffix.startsWith("?") || querySuffix === ""
      ? querySuffix
      : `?${querySuffix}`;
  const url = `${joinURL(api.baseURL, path)}${qs}`;
  const headers = mergeHeaders(api.headers, resource.headers, operation.headers, call.headers);
  const timeout = call.timeout ?? operation.timeout ?? resource.timeout ?? api.timeout;
  const retry = resolveRetryConfig(
    call.retry !== undefined ? call.retry : (operation.retry ?? resource.retry ?? api.retry),
  );
  const { signal, cleanup } = createTimeoutSignal(timeout, call.signal);
  const meta: Record<string, unknown> = { ...(call.meta ?? {}) };

  const request: RequestConfig = {
    method: operation.method,
    url,
    path: operation.path,
    baseURL: api.baseURL,
    headers,
    params: call.params,
    query: call.query,
    body: call.body,
    signal,
    timeout,
  };

  try {
    const maxRetries = retry?.retries ?? 0;
    let lastError: unknown;
    let lastResponse: ApiResponse<unknown> | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await runMiddlewareAttempt(api, request, attempt, meta, call.responseType);
        lastResponse = response;

        if (response.raw.ok) {
          return (call.full ? response : response.data) as TData | ApiResponse<TData>;
        }

        const httpError = new HttpError(`Request failed with status ${response.status}`, {
          status: response.status,
          data: response.data,
          request,
          response,
          attempt,
          retryable: Boolean(
            retry &&
            decideRetry(
              retry,
              {
                request,
                response,
                attempt,
                method: operation.method,
              },
              undefined,
            ),
          ),
        });

        if (
          !retry ||
          !decideRetry(
            retry,
            { request, response, attempt, method: operation.method, error: httpError },
            httpError,
          )
        ) {
          throw httpError;
        }

        lastError = httpError;
        await retryWait(retry, attempt, request, response, httpError);
      } catch (error) {
        if (error instanceof HttpError) {
          throw error;
        }

        lastError = error;

        if (isAbortLike(error) && !isTimeoutLike(error)) {
          attachAttempt(error, attempt);
          classifyRequestError(error, request);
        }

        if (
          !retry ||
          !decideRetry(
            retry,
            { request, response: lastResponse, attempt, method: operation.method, error },
            error,
          )
        ) {
          attachAttempt(error, attempt);
          classifyRequestError(error, request);
        }

        await retryWait(retry, attempt, request, lastResponse, error);
      }
    }

    attachAttempt(lastError, maxRetries);
    classifyRequestError(lastError, request);
  } finally {
    cleanup();
  }
}

async function retryWait(
  retry: ResolvedRetryConfig,
  attempt: number,
  request: RequestConfig,
  response: ApiResponse<unknown> | undefined,
  error: unknown,
): Promise<void> {
  await retry.onRetry?.({
    request,
    response,
    error,
    attempt,
    method: request.method,
  });
  const waitMs = computeRetryDelayMs(attempt, retry, response);
  try {
    await delay(waitMs, request.signal);
  } catch (abortError) {
    classifyRequestError(abortError, request);
  }
}

async function runMiddlewareAttempt(
  api: ResolvedApiConfig,
  request: RequestConfig,
  attempt: number,
  meta: Record<string, unknown>,
  responseType?: ResponseType,
): Promise<ApiResponse<unknown>> {
  const ctx = { request, response: undefined as ApiResponse<unknown> | undefined, attempt, meta };
  const leaf = () => transportOnce(api, request, responseType, ctx);

  if (!api.middleware?.length) {
    return leaf();
  }

  return composeMiddleware(api.middleware)(ctx, leaf);
}

async function transportOnce(
  api: ResolvedApiConfig,
  request: RequestConfig,
  responseType: ResponseType | undefined,
  ctx: { response?: ApiResponse<unknown> },
): Promise<ApiResponse<unknown>> {
  try {
    const serializedBody = serializeBody(request.body, request.headers);
    const transportResponse = await api.transport.request({
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: serializedBody,
      signal: request.signal,
      responseType,
    });

    const apiResponse: ApiResponse<unknown> = {
      data: transportResponse.body,
      status: transportResponse.status,
      headers: transportResponse.headers,
      raw: transportResponse.raw,
    };
    ctx.response = apiResponse;
    return apiResponse;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    classifyRequestError(error, request);
  }
}

function attachAttempt(error: unknown, attempt: number): void {
  if (error instanceof ApiError) {
    error.attempt = attempt;
  }
}
