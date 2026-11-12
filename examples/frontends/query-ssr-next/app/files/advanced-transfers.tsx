"use client";
import { createTransferControl, type TransferCheckpoint, type TransferControl } from "apixa/core";
import { useResourceMutation } from "apixa/react";
import { useRef, useState } from "react";
import { createAdvancedApi } from "../../lib/advanced-transfer";

export function AdvancedTransfers() {
  const [api] = useState(createAdvancedApi);
  const mutation = useResourceMutation(api.transfers, { queryKey: ["advanced-files"] });
  const source = useRef<Blob | null>(null);
  const checkpoint = useRef<TransferCheckpoint | undefined>(undefined);
  const control = useRef<TransferControl | null>(null);
  const [status, setStatus] = useState("idle");
  const [confirmed, setConfirmed] = useState(0);
  const upload = async (resume: boolean) => {
    if (!resume) {
      source.current = new Blob([new Uint8Array(13).map((_, i) => i)]);
      checkpoint.current = undefined;
    }
    if (!source.current) return;
    control.current = createTransferControl();
    setStatus("running");
    try {
      const result = await mutation.create(
        { document: source.current },
        {
          transfer: {
            control: control.current,
            checkpoint: resume ? checkpoint.current : undefined,
            saveCheckpoint(value) {
              checkpoint.current = value;
            },
            onSession(value) {
              setConfirmed(value.confirmedBytes);
            },
          },
        },
      );
      setStatus(`complete: ${result.size} bytes`);
    } catch (error) {
      setStatus(`${resume ? "error" : "interrupted"}: ${(error as Error).name}`);
    }
  };
  return (
    <section>
      <h2>Chunked upload and recovery</h2>
      <p>
        This 13-byte demonstration deliberately interrupts before part two. Resume reconciles with
        the server.
      </p>
      <button data-testid="advanced-start" onClick={() => void upload(false)}>
        Start interrupted upload
      </button>
      <button data-testid="advanced-resume" onClick={() => void upload(true)}>
        Resume from checkpoint
      </button>
      <button data-testid="advanced-cancel" onClick={() => control.current?.cancel()}>
        Cancel advanced upload
      </button>
      <p data-testid="advanced-status">{status}</p>
      <p data-testid="advanced-confirmed">{confirmed} confirmed bytes</p>
    </section>
  );
}
