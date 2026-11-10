import type { OperationFnRequestInit } from "./builtins.js";
import type {
  ApiResponse,
  RequestOptions,
  BinaryResponseType,
  ResponseTypeData,
} from "./transport.js";
import type { RequestMiddleware } from "./middleware.js";

export interface PresignedPolicy {
  origins: readonly string[];
  headers?: readonly string[];
  requestMiddleware?: readonly RequestMiddleware[];
}
export interface PresignedRequest {
  url: string;
  headers?: Record<string, string>;
}
export interface TransferPart {
  index: number;
  offset: number;
  size: number;
  blob: Blob;
  checksum?: string;
}
export interface TransferPartAck {
  index: number;
  offset: number;
  size: number;
  etag?: string;
  checksum?: string;
  verification: "unverified" | "local" | "server";
}
export interface TransferCheckpoint {
  version: 1;
  revision: number;
  protocol: { id: string; version: number };
  resource: string;
  operation: string;
  session: { id: string; expiresAt?: number };
  source: {
    size: number;
    type: string;
    name?: string;
    lastModified?: number;
    manifest: readonly string[];
  };
  chunkSize: number;
  parts: readonly TransferPartAck[];
}
export type TransferSessionState =
  | "starting"
  | "reconciling"
  | "uploading"
  | "pausing"
  | "paused"
  | "completing"
  | "complete"
  | "interrupted"
  | "cancelled"
  | "aborted"
  | "error";
export interface TransferSnapshot {
  phase: TransferSessionState;
  total: number;
  confirmedBytes: number;
  parts: readonly { index: number; attempt: number; loaded?: number; total?: number }[];
  checkpoint?: TransferCheckpoint;
}
export interface TransferControl {
  pause(): Promise<void>;
  resume(): void;
  cancel(reason?: unknown): void;
  abort(): Promise<void>;
}
export interface AdvancedTransferOptions {
  checkpoint?: TransferCheckpoint;
  control?: TransferControl;
  onSession?: (snapshot: TransferSnapshot) => void | Promise<void>;
  saveCheckpoint?: (checkpoint: TransferCheckpoint) => void | Promise<void>;
}
export interface AdvancedTransferFailure {
  reason:
    "checkpoint" | "durability" | "session-expired" | "integrity" | "protocol" | "interrupted";
  phase: TransferSessionState;
  checkpoint?: TransferCheckpoint;
}
export interface TransferStepContext {
  readonly signal: AbortSignal;
  request<RT extends BinaryResponseType, F extends boolean = false>(
    init: OperationFnRequestInit & { kind: "read" | "write"; responseType: RT; full?: F },
  ): Promise<F extends true ? ApiResponse<ResponseTypeData<RT>> : ResponseTypeData<RT>>;
  request<T = unknown>(init: OperationFnRequestInit & { kind: "read" | "write" }): Promise<T>;
}
export interface TransferInput {
  source: Blob;
  body: unknown;
  params?: RequestOptions["query"];
  query?: RequestOptions["query"];
  session: { id: string; expiresAt?: number };
  parts: readonly TransferPartAck[];
}
export interface TransferProtocol<T = unknown> {
  id: string;
  version: number;
  independentParts?: boolean;
  replaySafeParts?: boolean;
  emptyFile: "complete" | "single-part" | "reject";
  minChunkSize?: number;
  maxChunkSize?: number;
  maxParts?: number;
  initiate(
    ctx: TransferStepContext,
    input: Omit<TransferInput, "session" | "parts">,
  ): Promise<{ id: string; expiresAt?: number }>;
  inspect?(
    ctx: TransferStepContext,
    input: TransferInput,
  ): Promise<
    | { state: "active"; parts: readonly TransferPartAck[] }
    | { state: "completed"; result: ApiResponse<T> }
    | { state: "expired" | "aborted" }
  >;
  uploadPart(
    ctx: TransferStepContext,
    input: TransferInput & { part: TransferPart },
  ): Promise<TransferPartAck>;
  complete(ctx: TransferStepContext, input: TransferInput): Promise<ApiResponse<T>>;
  abort?(ctx: TransferStepContext, input: TransferInput): Promise<void>;
  renew?(ctx: TransferStepContext, input: TransferInput & { part: TransferPart }): Promise<void>;
}
export interface AdvancedTransferConfig<T = unknown> {
  strategy: "chunked";
  source: string | ((body: unknown) => Blob);
  chunkSize?: number;
  concurrency?: number;
  maxParts?: number;
  integrity?: "sha256" | "none";
  protocol: TransferProtocol<T>;
}
