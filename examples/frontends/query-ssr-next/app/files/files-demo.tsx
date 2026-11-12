"use client";

import { ValidationError, detectTransferSupport, type TransferEvent } from "@apixa/core";
import { useResource } from "@apixa/react";
import { useEffect, useRef, useState } from "react";
import { filesApi } from "../../lib/files-demo";

const show = (e: TransferEvent) =>
  e.phase === "unsupported" ? `${e.direction}:unsupported` : `${e.direction}:${e.phase}:${e.loaded}/${e.total ?? "?"}`;

/**
 * Files through the existing hook: rules reject locally, `onTransfer` reports counted progress,
 * and an AbortController cancels. Writes go through the hook's mutations; a one-off download with
 * progress uses the direct client, because a read called through the hook is a cached query (a second
 * call inside `staleTime` is served from the cache with no request and so no transfer events). Progress is plain React state fed by `onTransfer` (not part of any
 * query key); there is no extra transfer hook or store.
 */
export function FilesDemo() {
  const files = useResource(filesApi.files, { queryKey: ["files"] });
  const [file, setFile] = useState<File | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [status, setStatus] = useState("idle");
  const controller = useRef<AbortController | null>(null);
  // What the runtime can observe differs between server and browser: read it after mount only,
  // so server HTML and first client render agree (no hydration mismatch).
  const [support, setSupport] = useState("");
  useEffect(() => setSupport(JSON.stringify(detectTransferSupport())), []);

  const run = async (label: string, task: (signal: AbortSignal) => Promise<unknown>) => {
    controller.current = new AbortController();
    setEvents([]);
    setStatus(`${label}: running`);
    try {
      const result = await task(controller.current.signal);
      setStatus(`${label}: done ${result instanceof Blob ? `${result.size} bytes` : String(result)}`);
    } catch (error) {
      const violations = error instanceof ValidationError ? error.violations.map((v) => v.code).join(",") : "";
      setStatus(`${label}: ${(error as Error).name}${violations ? ` ${violations}` : ""}`);
    }
  };
  const onTransfer = (e: TransferEvent) => setEvents((previous) => [...previous, show(e)]);

  return (
    <section>
      <input data-testid="file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button data-testid="upload" onClick={() => file && void run("upload", (signal) => files.create({ name: "photo", photo: file }, { signal, onTransfer }))}>
        Upload (rules: images up to 1 KiB)
      </button>
      <button data-testid="send-stream" onClick={() => void run("send", (signal) => files.send(new ReadableStream({ start(c) { for (let i = 0; i < 4; i++) c.enqueue(new Uint8Array(500)); c.close(); } }), { signal, onTransfer }))}>
        Send a stream
      </button>
      <button data-testid="download" onClick={() => void run("download", (signal) => filesApi.files.download("1", { signal, onTransfer }))}>
        Download
      </button>
      <button data-testid="cancel" onClick={() => controller.current?.abort()}>Cancel</button>
      <p data-testid="status">{status}</p>
      <pre data-testid="events">{events.join("\n")}</pre>
      <p data-testid="support">{support}</p>
      <ul data-testid="list">{(files.data ?? []).map((f) => <li key={f.id}>{f.name}</li>)}</ul>
    </section>
  );
}
