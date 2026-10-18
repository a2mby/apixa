import { AbortError, ApiError, HttpError, TimeoutError } from "../errors/index.js";
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
import type { ApiResponse, RequestConfig, RequestOptions } from "../types/transport.js";

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
      if (error instanceof ApiError) {
        error.request ??= request;
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new AbortError("Request was aborted", { request, cause: error });
      }

      throw error;
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

    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new TimeoutError("Request timed out", { request, cause: error });
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AbortError("Request was aborted", { request, cause: error });
    }

    throw new ApiError(error instanceof Error ? error.message : "Unknown error", {
      request,
      cause: error,
    });
  } finally {
    cleanup();
  }
}
