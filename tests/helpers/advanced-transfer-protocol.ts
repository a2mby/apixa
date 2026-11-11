import { createHash } from "node:crypto";
import {
  NetworkError,
  defineApi,
  type AdvancedTransferConfig,
  type ApiResponse,
  type TransferCheckpoint,
  type TransferPartAck,
  type Transport,
  type TransportRequest,
} from "apixa/core";

type Result = { id: string; size: number };
interface Session {
  id: string;
  size: number;
  parts: Map<number, { bytes: Uint8Array; ack: TransferPartAck }>;
  state: "active" | "completed" | "expired" | "aborted";
}
/** Server ledger is independent of clients and checkpoints, so restart tests cannot fake recovery. */
export function protocolServer() {
  const sessions = new Map<string, Session>();
  const requests: TransportRequest[] = [];
  let active = 0;
  let maximum = 0;
  let completions = 0;
  let nextSession = 0;
  const faults = {
    failPart: -1,
    loseAck: -1,
    loseCompletion: false,
    failStatus: 0,
    latency: undefined as (() => Promise<void>) | undefined,
  };
  const transport: Transport = {
    capabilities: { presigned: true },
    async request(request) {
      requests.push(request);
      const url = new URL(request.url);
      const segments = url.pathname.split("/").filter(Boolean);
      const session = sessions.get(segments[2]!);
      let status = 200;
      let body: unknown;
      const headers = new Headers({ "content-type": "application/json" });
      if (request.method === "POST" && url.pathname === "/files/sessions") {
        const input = JSON.parse(String(request.body));
        const id = String(++nextSession);
        sessions.set(id, { id, size: input.size, parts: new Map(), state: "active" });
        body = { id };
      } else if (!session) {
        status = 404;
        body = { message: "missing" };
      } else if (request.method === "GET") {
        body = {
          state: session.state,
          parts: [...session.parts.values()].map((p) => p.ack),
          result: { id: session.id, size: session.size },
        };
      } else if (request.method === "DELETE") {
        session.state = "aborted";
        body = { aborted: true };
      } else if (segments[3] === "complete") {
        const manifest = JSON.parse(String(request.body)).parts as TransferPartAck[];
        const size = manifest.reduce(
          (sum, part) => sum + (session.parts.get(part.index)?.bytes.length ?? -1),
          0,
        );
        if (size !== session.size) throw new Error("Incomplete server assembly");
        completions++;
        session.state = "completed";
        body = { id: session.id, size };
        if (faults.loseCompletion) {
          faults.loseCompletion = false;
          throw new NetworkError("completion response lost");
        }
      } else {
        const index = Number(segments[4]);
        if (index === faults.failPart) {
          faults.failPart = -1;
          throw new NetworkError("part failed before commit");
        }
        if (faults.failStatus) {
          status = faults.failStatus;
          faults.failStatus = 0;
          body = { error: "expired url" };
        } else {
          active++;
          maximum = Math.max(maximum, active);
          try {
            await faults.latency?.();
            if (request.signal?.aborted) throw request.signal.reason;
            const bytes = new Uint8Array(await new Response(request.body).arrayBuffer());
            const offset = Number(request.headers.get("x-offset"));
            const checksum = request.headers.get("x-checksum") ?? undefined;
            if (checksum && checksum !== createHash("sha256").update(bytes).digest("hex"))
              throw new Error("Server checksum mismatch");
            const ack: TransferPartAck = {
              index,
              offset,
              size: bytes.length,
              etag: `"part-${index}"`,
              verification: checksum ? "server" : "unverified",
              ...(checksum ? { checksum } : {}),
            };
            session.parts.set(index, { bytes, ack });
            headers.set("etag", ack.etag!);
            body = ack;
            if (faults.loseAck === index) {
              faults.loseAck = -1;
              throw new NetworkError("part response lost after commit");
            }
          } finally {
            active--;
          }
        }
      }
      const raw = new Response(JSON.stringify(body), { status, headers });
      return { status, headers, raw, body };
    },
  };
  const config: AdvancedTransferConfig<Result> = {
    strategy: "chunked",
    source: "document",
    chunkSize: 4,
    integrity: "sha256",
    protocol: {
      id: "test-offset",
      version: 1,
      independentParts: true,
      replaySafeParts: true,
      emptyFile: "complete",
      initiate: (ctx, input) =>
        ctx.request({
          kind: "write",
          method: "POST",
          path: "/sessions",
          body: { size: input.source.size },
        }),
      inspect: async (ctx, input) => {
        const response = await ctx.request<
          ApiResponse<{ state: Session["state"]; parts: TransferPartAck[]; result: Result }>
        >({ kind: "read", method: "GET", path: `/sessions/${input.session.id}`, full: true });
        const state = response.data;
        return state.state === "completed"
          ? { state: "completed", result: { ...response, data: state.result } }
          : state.state === "active"
            ? { state: "active", parts: state.parts }
            : { state: state.state };
      },
      uploadPart: (ctx, input) =>
        ctx.request({
          kind: "write",
          method: "PUT",
          path: `/sessions/${input.session.id}/parts/${input.part.index}`,
          body: input.part.blob,
          headers: {
            "x-offset": String(input.part.offset),
            ...(input.part.checksum ? { "x-checksum": input.part.checksum } : {}),
          },
        }),
      complete: (ctx, input) =>
        ctx.request({
          kind: "write",
          method: "POST",
          path: `/sessions/${input.session.id}/complete`,
          body: { parts: input.parts },
          full: true,
        }),
      abort: async (ctx, input) => {
        await ctx.request({
          kind: "write",
          method: "DELETE",
          path: `/sessions/${input.session.id}`,
        });
      },
    },
  };
  const client = (override: Partial<AdvancedTransferConfig<Result>> = {}, operation: object = {}) =>
    defineApi<{ files: { entity: { id: string; size?: number; document: string } } }>()({
      baseURL: "https://api.example.com",
      transport,
      resources: {
        files: {
          path: "/files",
          fileFields: ["document"],
          operations: { create: { transfer: { ...config, ...override }, ...operation } },
        },
      },
    });
  const bytes = (id = "1") =>
    [...sessions.get(id)!.parts.entries()]
      .sort(([a], [b]) => a - b)
      .flatMap(([, p]) => [...p.bytes]);
  return {
    sessions,
    requests,
    faults,
    transport,
    config,
    client,
    bytes,
    get maximum() {
      return maximum;
    },
    get completions() {
      return completions;
    },
  };
}
export function source(size = 13): Blob {
  return new Blob([Uint8Array.from({ length: size }, (_, i) => i % 256)]);
}
export function captureCheckpoint() {
  let checkpoint: TransferCheckpoint | undefined;
  return {
    save(value: TransferCheckpoint) {
      checkpoint = value;
    },
    get value() {
      return checkpoint!;
    },
  };
}
