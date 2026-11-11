import { randomUUID } from "../utils/uuid.js";
import type { OperationFnRequestInit } from "../types/builtins.js";
import { containsBinary } from "../http/multipart.js";
import {
  AbortError,
  ApiError,
  ConfigError,
  HttpError,
  NetworkError,
  ValidationError,
} from "../errors/index.js";
import type { ApiResponse, RequestOptions, TransferEvent } from "../types/transport.js";
import type {
  AdvancedTransferConfig,
  TransferCheckpoint,
  TransferInput,
  TransferPart,
  TransferPartAck,
  TransferSessionState,
  TransferSnapshot,
  TransferStepContext,
} from "../types/advanced-transfer.js";
import { bindControl } from "./control.js";
import { freezeSnapshot, integer, validateAck, validateCheckpoint } from "./checkpoint.js";
import { digestPart } from "./integrity.js";

export function validateAdvanced(config: AdvancedTransferConfig): void {
  if (
    !config ||
    config.strategy !== "chunked" ||
    (typeof config.source !== "string" && typeof config.source !== "function")
  )
    throw new ConfigError("Invalid advanced transfer configuration.");
  for (const [name, n] of Object.entries({
    chunkSize: config.chunkSize,
    concurrency: config.concurrency,
    maxParts: config.maxParts,
  })) {
    if (n !== undefined && !integer(n, 1))
      throw new ConfigError(`transfer.${name} must be a positive safe integer.`);
  }
  if (
    config.integrity !== undefined &&
    config.integrity !== "sha256" &&
    config.integrity !== "none"
  )
    throw new ConfigError("Invalid transfer integrity mode.");
  const p = config.protocol;
  if (
    !p ||
    typeof p.id !== "string" ||
    !p.id ||
    !integer(p.version, 1) ||
    !["complete", "single-part", "reject"].includes(p.emptyFile)
  )
    throw new ConfigError("Invalid transfer protocol identity or empty-file behavior.");
  for (const key of ["initiate", "uploadPart", "complete"] as const)
    if (typeof p[key] !== "function")
      throw new ConfigError(`transfer.protocol.${key} is required.`);
  for (const key of ["independentParts", "replaySafeParts"] as const) {
    if (p[key] !== undefined && typeof p[key] !== "boolean")
      throw new ConfigError(`Invalid transfer.protocol.${key}.`);
  }
  for (const key of ["inspect", "abort", "renew"] as const)
    if (p[key] !== undefined && typeof p[key] !== "function")
      throw new ConfigError(`Invalid transfer.protocol.${key}.`);
  for (const key of ["minChunkSize", "maxChunkSize", "maxParts"] as const)
    if (p[key] !== undefined && !integer(p[key], 1))
      throw new ConfigError(`Invalid transfer.protocol.${key}.`);
  if ((p.minChunkSize ?? 1) > (p.maxChunkSize ?? Number.MAX_SAFE_INTEGER))
    throw new ConfigError("Conflicting protocol chunk limits.");
}
interface Runtime {
  signal: AbortSignal;
  resource: string;
  operation: string;
  params?: TransferInput["params"];
  query?: TransferInput["query"];
  request: <V>(
    init: OperationFnRequestInit & { kind: "read" | "write" },
    key?: string,
  ) => Promise<V>;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
/** Private bounded orchestrator. Every HTTP step is supplied by the existing request pipeline. */
export async function runAdvanced<T>(
  config: AdvancedTransferConfig<T>,
  body: unknown,
  options: RequestOptions,
  runtime: Runtime,
): Promise<ApiResponse<T>> {
  validateAdvanced(config);
  if (options.responseType === "stream")
    throw new ConfigError(
      "Use a separate streamed download operation; advanced upload completion must settle its response body.",
    );
  const protocol = config.protocol;
  const source =
    typeof config.source === "function"
      ? config.source(body)
      : (body as Record<string, unknown> | null)?.[config.source];
  if (!(source instanceof Blob))
    throw new ConfigError("Advanced transfer source must select one Blob or File.");
  const chunkSize = config.chunkSize ?? Math.max(8 * 1024 * 1024, protocol.minChunkSize ?? 1);
  const maxParts = Math.min(config.maxParts ?? 10_000, protocol.maxParts ?? 10_000);
  const count =
    source.size === 0 && protocol.emptyFile === "complete"
      ? 0
      : Math.max(1, Math.ceil(source.size / chunkSize));
  if (
    chunkSize < (protocol.minChunkSize ?? 1) ||
    chunkSize > (protocol.maxChunkSize ?? Number.MAX_SAFE_INTEGER) ||
    count > maxParts ||
    !integer(source.size)
  )
    throw new ConfigError("Source layout exceeds transfer protocol limits.");
  if (!source.size && protocol.emptyFile === "reject")
    throw new ValidationError("This protocol rejects empty files.");
  const resume = options.transfer?.checkpoint;
  if (resume && !protocol.inspect)
    throw new ConfigError("This protocol cannot resume upload sessions.");
  if (options.transfer?.saveCheckpoint && !protocol.inspect)
    throw new ConfigError("Checkpoint persistence requires authoritative session inspection.");
  if (resume) validateCheckpoint(resume, maxParts);
  const ctl = new AbortController();
  const abortFromParent = () => ctl.abort(runtime.signal.reason);
  runtime.signal.addEventListener("abort", abortFromParent, { once: true });
  if (runtime.signal.aborted) abortFromParent();
  const gate = <V>(promise: Promise<V>, signal = ctl.signal): Promise<V> => {
    if (signal.aborted) return Promise.reject(signal.reason ?? new AbortError());
    return new Promise<V>((resolve, reject) => {
      const aborted = () => reject(signal.reason ?? new AbortError());
      signal.addEventListener("abort", aborted, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
    });
  };
  const check = () => {
    if (ctl.signal.aborted) throw ctl.signal.reason ?? new AbortError();
  };
  let phase: TransferSessionState = "starting";
  let session: TransferInput["session"] | undefined;
  let revision = resume?.revision ?? 0;
  const confirmed = new Map<number, TransferPartAck>();
  const progress = new Map<
    number,
    { index: number; attempt: number; loaded?: number; total?: number }
  >();
  let manifest: string[] = [];
  let checkpoint: TransferCheckpoint | undefined;
  let paused = false;
  let wake = deferred();
  let idle = deferred();
  let active = 0;
  let ended = false;
  let abortTask: Promise<void> | undefined;
  let abortedRemote = false;
  let saving: Promise<void> = Promise.resolve();
  const parts = () => [...confirmed.values()].sort((a, b) => a.index - b.index);
  const emit = (next = phase) => {
    phase = next;
    if (!options.transfer?.onSession) return;
    const snapshot: TransferSnapshot = freezeSnapshot({
      phase,
      total: source.size,
      confirmedBytes: parts().reduce((sum, p) => sum + p.size, 0),
      parts: [...progress.values()].map((p) => ({ ...p })),
      ...(checkpoint ? { checkpoint } : {}),
    });
    try {
      Promise.resolve(options.transfer.onSession(snapshot)).catch(() => {});
    } catch {
      /* observer */
    }
  };
  const input = (): TransferInput => ({
    source,
    body,
    params: runtime.params,
    query: runtime.query,
    session: session!,
    parts: parts(),
  });
  const failure = (
    reason: NonNullable<ApiError["advancedTransfer"]>["reason"],
    message: string,
  ): ApiError => {
    const error = reason === "checkpoint" ? new ConfigError(message) : new ValidationError(message);
    error.advancedTransfer = { reason, phase, ...(checkpoint ? { checkpoint } : {}) };
    return error;
  };
  const save = () => {
    if (!protocol.inspect || !session) return Promise.resolve();
    checkpoint = freezeSnapshot({
      version: 1,
      revision: ++revision,
      protocol: { id: protocol.id, version: protocol.version },
      resource: runtime.resource,
      operation: runtime.operation,
      session: { ...session },
      source: {
        size: source.size,
        type: source.type,
        ...(typeof File !== "undefined" && source instanceof File
          ? { name: source.name, lastModified: source.lastModified }
          : {}),
        manifest: [...manifest],
      },
      chunkSize,
      parts: parts().map((p) => ({ ...p })),
    });
    validateCheckpoint(checkpoint, maxParts);
    const snapshot = checkpoint;
    saving = saving.then(async () => {
      check();
      try {
        await gate(Promise.resolve(options.transfer?.saveCheckpoint?.(snapshot)));
      } catch (error) {
        check();
        throw failure("durability", "Transfer checkpoint could not be persisted.");
      }
    });
    return saving;
  };
  const context = (
    part?: TransferPart,
    remoteAbort = false,
    finalResponse = false,
  ): TransferStepContext => ({
    signal: remoteAbort ? runtime.signal : ctl.signal,
    request: <V>(init: Parameters<TransferStepContext["request"]>[0]) => {
      const signal = remoteAbort ? runtime.signal : ctl.signal;
      const onTransfer = (event: TransferEvent) => {
        if (
          !ended &&
          part &&
          event.direction === "upload" &&
          (containsBinary(init.body) ||
            init.body instanceof FormData ||
            init.body instanceof ArrayBuffer ||
            ArrayBuffer.isView(init.body))
        ) {
          progress.set(part.index, {
            index: part.index,
            attempt: event.attempt,
            ...("loaded" in event
              ? {
                  loaded: event.loaded,
                  ...("total" in event && event.total !== undefined ? { total: event.total } : {}),
                }
              : {}),
          });
          emit();
        }
        const observer = init.onTransfer ?? options.onTransfer;
        try {
          Promise.resolve(observer?.(event)).catch(() => {});
        } catch {
          /* observer */
        }
      };
      const payload =
        containsBinary(init.body) ||
        init.body instanceof FormData ||
        init.body instanceof ArrayBuffer ||
        ArrayBuffer.isView(init.body);
      const partHeaders = new Headers(init.headers as HeadersInit);
      const partKey =
        part && payload
          ? `${session!.id}:part:${part.index}:${manifest[part.index] ?? source.size}:${init.method ?? "GET"}:${init.path ?? ""}`
          : undefined;
      const requestKey =
        init.kind !== "write"
          ? undefined
          : (partKey ??
            (!session
              ? options.idempotencyKey
                ? `${options.idempotencyKey}:initiate:${init.path ?? ""}`
                : undefined
              : finalResponse || remoteAbort
                ? `${session.id}:${remoteAbort ? "abort" : "complete"}:${init.path ?? ""}`
                : options.idempotencyKey
                  ? randomUUID()
                  : undefined));
      if (
        partKey &&
        init.kind === "write" &&
        !init.presigned &&
        protocol.replaySafeParts &&
        !partHeaders.has("idempotency-key")
      ) {
        partHeaders.set("Idempotency-Key", partKey);
      }
      return gate(
        runtime.request<V>(
          {
            ...init,
            responseType: finalResponse
              ? (options.responseType ?? init.responseType)
              : init.responseType,
            signal,
            onTransfer,
            ...(!payload &&
            init.kind === "write" &&
            init.retry === undefined &&
            !options.idempotencyKey
              ? { retry: false }
              : {}),
            ...(part && !protocol.replaySafeParts ? { retry: false } : {}),
            ...(part && !init.presigned && protocol.replaySafeParts
              ? { headers: partHeaders }
              : {}),
          },
          requestKey,
        ),
        signal,
      );
    },
  });
  const resultMode = (result: ApiResponse<T>) => {
    const mode = options.responseType;
    if (
      (mode === "blob" && !(result.data instanceof Blob)) ||
      (mode === "arrayBuffer" && !(result.data instanceof ArrayBuffer)) ||
      (mode === "text" && typeof result.data !== "string")
    )
      throw failure(
        "protocol",
        "Completed session did not provide the requested response representation.",
      );
    if (typeof ReadableStream !== "undefined" && result.data instanceof ReadableStream)
      throw new ConfigError(
        "Return settled completion data and download streams with a separate operation.",
      );
    return result;
  };
  const reconcile = async (): Promise<ApiResponse<T> | undefined> => {
    if (!protocol.inspect) throw failure("protocol", "Cannot reconcile this transfer protocol.");
    emit("reconciling");
    let state: Awaited<ReturnType<NonNullable<typeof protocol.inspect>>>;
    try {
      state = await gate(protocol.inspect(context(), input()));
    } catch (error) {
      if (error instanceof HttpError && [404, 410].includes(error.status ?? 0))
        throw failure("session-expired", "Upload session is unknown or expired.");
      throw error;
    }
    check();
    if (state.state === "expired" || state.state === "aborted")
      throw failure("session-expired", "Upload session is expired or aborted.");
    if (state.state === "completed") {
      if (
        !state.result ||
        typeof state.result.status !== "number" ||
        state.result.status < 200 ||
        state.result.status >= 300 ||
        !state.result.request ||
        !(state.result.headers instanceof Headers)
      )
        throw failure("protocol", "Invalid authoritative completion result.");
      return resultMode(state.result);
    }
    if (state.state !== "active" || !Array.isArray(state.parts) || state.parts.length > maxParts)
      throw failure("protocol", "Invalid authoritative session state.");
    const server = new Map<number, TransferPartAck>();
    for (const ack of state.parts) {
      validateAck(ack, source.size, chunkSize, Math.max(1, count));
      if (server.has(ack.index))
        throw failure("protocol", "Server returned duplicate upload parts.");
      if (ack.checksum && ack.checksum !== manifest[ack.index])
        throw failure("integrity", "Server part checksum does not match source.");
      const old = confirmed.get(ack.index);
      if (old?.etag && ack.etag && old.etag !== ack.etag)
        throw failure("integrity", "Server part identity conflicts with the checkpoint.");
      server.set(ack.index, { ...ack });
    }
    confirmed.clear();
    for (const [index, ack] of server) confirmed.set(index, ack);
    await save();
    emit("uploading");
  };
  let unbind: () => void = () => {};
  try {
    unbind = bindControl(options.transfer?.control, {
      pause: async () => {
        if (ended) return;
        paused = true;
        emit("pausing");
        if (active) await gate(idle.promise);
        await gate(saving);
        check();
        emit("paused");
      },
      resume: () => {
        paused = false;
        wake.resolve();
        wake = deferred();
        if (!ended) emit("uploading");
      },
      cancel: (reason) => {
        ctl.abort(new AbortError("Transfer was cancelled.", { cause: reason }));
        wake.resolve();
      },
      abort: () => {
        if (!protocol.abort)
          return Promise.reject(new ConfigError("This protocol cannot abort a server session."));
        if (abortTask) return abortTask;
        abortTask = (async () => {
          if (!session || ended) throw new ConfigError("No active remote upload session.");
          ctl.abort(new AbortError("Transfer server abort requested."));
          wake.resolve();
          if (active) await idle.promise;
          await gate(protocol.abort!(context(undefined, true), input()), runtime.signal);
          abortedRemote = true;
          checkpoint = undefined;
          emit("aborted");
        })();
        return abortTask;
      },
    });
    emit();
    check();
    if (protocol.inspect || config.integrity === "sha256") {
      // One digest buffer at a time; metadata is capped before the first byte read.
      for (let i = 0; i < Math.max(1, count); i++) {
        check();
        manifest.push(
          await gate(
            digestPart(source.slice(i * chunkSize, Math.min(source.size, (i + 1) * chunkSize))),
          ),
        );
      }
    }
    if (resume) {
      if (
        resume.resource !== runtime.resource ||
        resume.operation !== runtime.operation ||
        resume.protocol.id !== protocol.id ||
        resume.protocol.version !== protocol.version ||
        resume.chunkSize !== chunkSize ||
        resume.source.size !== source.size ||
        resume.source.type !== source.type ||
        resume.source.manifest.length !== manifest.length ||
        resume.source.manifest.some((hash, i) => hash !== manifest[i])
      )
        throw failure("checkpoint", "Checkpoint is incompatible with the operation or source.");
      session = { ...resume.session };
      for (const ack of resume.parts) confirmed.set(ack.index, { ...ack });
    } else {
      session = await gate(
        protocol.initiate(context(), {
          source,
          body,
          params: runtime.params,
          query: runtime.query,
        }),
      );
    }
    if (
      !session ||
      typeof session.id !== "string" ||
      !session.id ||
      session.id.length > 2048 ||
      Object.keys(session).some((key) => !["id", "expiresAt"].includes(key)) ||
      (session.expiresAt !== undefined && !integer(session.expiresAt))
    )
      throw failure("protocol", "Invalid upload session metadata.");
    if (session.expiresAt !== undefined && session.expiresAt <= Date.now())
      throw failure("session-expired", "Upload session has expired.");
    if (resume) {
      const complete = await reconcile();
      if (complete) {
        emit("complete");
        return complete;
      }
    } else await save();
    emit("uploading");
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        check();
        while (paused) {
          if (!active) emit("paused");
          await gate(wake.promise);
          check();
        }
        const index = cursor++;
        if (index >= count) return;
        if (confirmed.has(index)) continue;
        const offset = index * chunkSize;
        const part: TransferPart = {
          index,
          offset,
          size: Math.min(chunkSize, source.size - offset),
          blob: source.slice(offset, Math.min(source.size, offset + chunkSize)),
          ...(config.integrity === "sha256" ? { checksum: manifest[index] } : {}),
        };
        active++;
        try {
          let ack: TransferPartAck;
          try {
            ack = await gate(protocol.uploadPart(context(part), { ...input(), part }));
          } catch (error) {
            check();
            if (
              !(error instanceof HttpError) ||
              ![401, 403].includes(error.status ?? 0) ||
              !protocol.renew ||
              !protocol.inspect ||
              !protocol.replaySafeParts
            )
              throw error;
            await gate(protocol.renew(context(part), { ...input(), part }));
            const completed = await reconcile();
            if (completed)
              throw failure("protocol", "Session completed unexpectedly during part renewal.");
            const existing = confirmed.get(index);
            ack =
              existing ?? (await gate(protocol.uploadPart(context(part), { ...input(), part })));
          }
          check();
          validateAck(ack, source.size, chunkSize, count);
          if (ack.index !== index || (ack.checksum && ack.checksum !== manifest[index]))
            throw failure("integrity", "Upload part acknowledgment does not match sent bytes.");
          confirmed.set(index, { ...ack });
          await save();
          check();
          emit();
        } finally {
          active--;
          if (!active) {
            idle.resolve();
            idle = deferred();
          }
        }
      }
    };
    const concurrency = protocol.independentParts ? (config.concurrency ?? 1) : 1;
    const workers = Array.from({ length: Math.min(concurrency, Math.max(1, count)) }, () =>
      worker().catch((error) => {
        ctl.abort(error);
        wake.resolve();
        throw error;
      }),
    );
    const outcomes = await Promise.allSettled(workers);
    const failed = outcomes.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) throw failed.reason;
    check();
    if (paused) await gate(wake.promise);
    if (confirmed.size !== count)
      throw failure("protocol", "Upload is missing required part acknowledgments.");
    emit("completing");
    let result: ApiResponse<T>;
    try {
      result = await gate(protocol.complete(context(undefined, false, true), input()));
    } catch (error) {
      check();
      if (!protocol.inspect || !(error instanceof NetworkError)) throw error;
      const reconciled = await reconcile();
      if (!reconciled) throw error;
      result = reconciled;
    }
    check();
    if (
      !result ||
      typeof result.status !== "number" ||
      result.status < 200 ||
      result.status >= 300 ||
      !(result.headers instanceof Headers) ||
      !result.request
    )
      throw failure("protocol", "Backend did not confirm upload completion.");
    resultMode(result);
    emit("complete");
    return result;
  } catch (thrown) {
    if (abortTask) {
      try {
        await abortTask;
      } catch (error) {
        thrown = error;
      }
    }
    const error =
      thrown instanceof ApiError
        ? thrown
        : new NetworkError("Advanced transfer failed.", { cause: thrown });
    if (!error.advancedTransfer)
      error.advancedTransfer = {
        reason: error instanceof ConfigError ? "checkpoint" : "interrupted",
        phase,
        ...(checkpoint ? { checkpoint } : {}),
      };
    if (!abortedRemote)
      emit(
        error instanceof AbortError
          ? "cancelled"
          : error instanceof NetworkError
            ? "interrupted"
            : "error",
      );
    throw error;
  } finally {
    ended = true;
    ctl.abort(new AbortError());
    wake.resolve();
    unbind();
    runtime.signal.removeEventListener("abort", abortFromParent);
  }
}
