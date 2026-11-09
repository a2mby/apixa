/**
 * What this runtime can observe about a transfer, decided by feature probes only (never by
 * user-agent or runtime-name sniffing).
 */
export interface TransferSupport {
  /**
   * Upload progress for bodies of known size (`File`, `Blob`, `FormData`, buffers, strings): the
   * runtime streams request bodies **and** lets Apixa keep the original `Content-Length`. Where a
   * runtime forbids setting that header (browsers), these uploads report `unsupported`.
   */
  uploadProgress: boolean;
  /** Request bodies may be a `ReadableStream` (`duplex: "half"`); counted bytes are reported. */
  streamingUpload: boolean;
  /** Response bodies are readable streams, so downloads can be counted without buffering. */
  downloadProgress: boolean;
  /** `ReadableStream` can be consumed with backpressure (pull-based reader wrapping). */
  streamTransform: boolean;
}

/** The globals the probes read; injectable so tests can stub a runtime. */
export interface TransferSupportEnv {
  Request?: typeof Request;
  Response?: typeof Response;
  ReadableStream?: typeof ReadableStream;
  Blob?: typeof Blob;
}

function probeStreamingUpload(env: TransferSupportEnv): boolean {
  const { Request: R, ReadableStream: RS } = env;
  if (typeof R !== "function" || typeof RS !== "function") return false;
  try {
    let duplexAccessed = false;
    const hasContentType = new R("http://localhost", {
      body: new RS(),
      method: "POST",
      get duplex() {
        duplexAccessed = true;
        return "half";
      },
    } as RequestInit).headers.has("content-type");
    return duplexAccessed && !hasContentType;
  } catch {
    return false;
  }
}

function probeContentLengthSettable(env: TransferSupportEnv): boolean {
  const { Request: R } = env;
  if (typeof R !== "function") return false;
  try {
    return new R("http://localhost", {
      method: "POST",
      body: "a",
      headers: { "content-length": "1" },
    }).headers.has("content-length");
  } catch {
    return false;
  }
}

export function detectTransferSupport(
  env: TransferSupportEnv = globalThis as TransferSupportEnv,
): TransferSupport {
  const streamingUpload = probeStreamingUpload(env);
  const streams = typeof env.ReadableStream === "function" && typeof env.Response === "function";
  let bodyStreams = false;
  if (streams) {
    try {
      bodyStreams = new env.Response!("x").body instanceof env.ReadableStream!;
    } catch {
      bodyStreams = false;
    }
  }
  return {
    streamingUpload,
    uploadProgress:
      streamingUpload &&
      typeof env.Blob === "function" &&
      typeof env.Blob.prototype.stream === "function" &&
      probeContentLengthSettable(env),
    downloadProgress: bodyStreams,
    streamTransform: streams && typeof env.ReadableStream!.prototype.getReader === "function",
  };
}
