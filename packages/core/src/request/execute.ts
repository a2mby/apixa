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
import type { ApiResponse, RequestConfig, RequestOptions } from "../types/transport.js";
import { classifyRequestError, isAbortLike, isTimeoutLike } from "./classify-error.js";
import { composeMiddleware } from "./middleware.js";
import { computeRetryDelayMs, delay, resolveRetryConfig, shouldRetry } from "./retry.js";

export interface ExecuteArgs {
  params?: PathParams;
  query?: QueryParams;
  body?: unknown;
  headers?: RequestOptions["headers"];
  signal?: AbortSignal;
  timeout?: number;
}

export async function executeRequest<TData>(
  api: ResolvedApiConfig,
  resource: ResolvedResourceConfig,
  operation: ResolvedOperation,
  call: ExecuteArgs = {},
): Promise<TData> {
  const path = interpolatePath(operation.path, call.params);
  const url = `${joinURL(api.baseURL, path)}${buildQueryString(call.query)}`;
  const headers = mergeHeaders(api.headers, resource.headers, operation.headers, call.headers);
  const timeout = call.timeout ?? operation.timeout ?? resource.timeout ?? api.timeout;
  const retry = resolveRetryConfig(operation.retry ?? resource.retry ?? api.retry);
  const { signal, cleanup } = createTimeoutSignal(timeout, call.signal);

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

  const runAttempts = () => executeAttempts<TData>(api, operation, request, retry);

  try {
    if (!api.middleware?.length) {
      return await runAttempts();
    }

    const result = await composeMiddleware(api.middleware)({ request }, runAttempts);
    return result as TData;
  } finally {
    cleanup();
  }
}

async function executeAttempts<TData>(
  api: ResolvedApiConfig,
  operation: ResolvedOperation,
  request: RequestConfig,
  retry: ResolvedRetryConfig | undefined,
): Promise<TData> {
  const maxRetries = retry?.retries ?? 0;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await singleAttempt<TData>(api, request);
    } catch (error) {
      lastError = error;

      if (isAbortLike(error) && !isTimeoutLike(error)) {
        classifyRequestError(error, request);
      }

      if (!retry || !shouldRetry(error, operation.method, retry, attempt)) {
        classifyRequestError(error, request);
      }

      const waitMs = computeRetryDelayMs(attempt, retry);
      try {
        await delay(waitMs, request.signal);
      } catch (abortError) {
        classifyRequestError(abortError, request);
      }
    }
  }

  classifyRequestError(lastError, request);
}

async function singleAttempt<TData>(
  api: ResolvedApiConfig,
  request: RequestConfig,
): Promise<TData> {
  try {
    const serializedBody = serializeBody(request.body, request.headers);

    let transportResponse;
    try {
      transportResponse = await api.transport.request({
        url: request.url,
        method: request.method,
        headers: request.headers,
        body: serializedBody,
        signal: request.signal,
      });
    } catch (error) {
      classifyRequestError(error, request);
    }

    const apiResponse: ApiResponse<unknown> = {
      data: transportResponse.body,
      status: transportResponse.status,
      headers: transportResponse.headers,
      raw: transportResponse.raw,
    };

    if (!transportResponse.raw.ok) {
      throw new HttpError(`Request failed with status ${transportResponse.status}`, {
        status: transportResponse.status,
        data: transportResponse.body,
        request,
        response: apiResponse,
      });
    }

    return transportResponse.body as TData;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    classifyRequestError(error, request);
  }
}
