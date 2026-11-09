import type { ApiError } from "../errors/api-error.js";
import type {
  TransferDirection,
  TransferEvent,
  TransferObserver,
  TransportTransferEvent,
} from "../types/transport.js";

interface DirectionState {
  started: boolean;
  terminal: boolean;
  unsupported: boolean;
  loaded: number;
  total?: number;
}

const DIRECTIONS: readonly TransferDirection[] = ["upload", "download"];

/** Invoke an observer without letting it break the transfer (sync throw or async rejection). */
function deliver(observer: TransferObserver, event: TransferEvent): void {
  try {
    const result = observer(event);
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch(() => {});
    }
  } catch {
    /* observers must never break a transfer */
  }
}

/** Why a started direction ended without completing. */
export type TransferFailure =
  { kind: "abort"; reason?: unknown } | { kind: "error"; error: Error; willRetry: boolean };

/**
 * Event state for one attempt. It enforces the contract: per direction `start`, `progress`*, then
 * exactly one of `complete` / `error` / `abort`, or a single `unsupported`. Created only when the
 * caller opted in.
 */
export class TransferChannel {
  private readonly state: Record<TransferDirection, DirectionState> = {
    upload: { started: false, terminal: false, unsupported: false, loaded: 0 },
    download: { started: false, terminal: false, unsupported: false, loaded: 0 },
  };

  constructor(
    private readonly observer: TransferObserver,
    readonly attempt: number,
  ) {}

  /** The callback handed to a transport (`TransportRequest.onTransfer`). */
  readonly sink = (event: TransportTransferEvent): void => {
    const s = this.state[event.direction];
    if (s.terminal) return;
    if (event.phase === "unsupported") {
      if (s.started || s.unsupported) return;
      s.unsupported = true;
      s.terminal = true;
      deliver(this.observer, {
        phase: "unsupported",
        direction: event.direction,
        attempt: this.attempt,
        reason: event.reason,
      });
      return;
    }
    if (event.phase === "start") {
      if (s.started || s.unsupported) return;
      s.started = true;
    } else if (!s.started) {
      return;
    }
    s.loaded = event.loaded;
    s.total = event.total;
    // A total the body outgrew was not trustworthy: stop reporting it rather than mislead.
    if (s.total !== undefined && s.loaded > s.total) s.total = undefined;
    if (event.phase === "complete") s.terminal = true;
    deliver(this.observer, {
      phase: event.phase,
      direction: event.direction,
      attempt: this.attempt,
      loaded: s.loaded,
      ...(s.total !== undefined ? { total: s.total } : {}),
    });
  };

  /**
   * After the transport resolved: a direction it never reported on (a custom transport that ignores
   * `onTransfer`) is `unsupported`, never silently skipped and never faked.
   */
  finishRequest(hasUploadBody: boolean): void {
    for (const direction of DIRECTIONS) {
      if (direction === "upload" && !hasUploadBody) continue;
      const s = this.state[direction];
      if (s.started || s.unsupported) continue;
      this.sink({
        phase: "unsupported",
        direction,
        reason: "the transport does not report transfer progress",
      });
    }
  }

  /** A mocked resource: nothing crosses a wire, so upload is unsupported and no bytes are invented. */
  unsupported(direction: TransferDirection, reason: string): void {
    this.sink({ phase: "unsupported", direction, reason });
  }

  /** Complete a started direction with its last observed count (used when a stream drains). */
  completeDownload(): void {
    const s = this.state.download;
    if (s.started && !s.terminal) {
      this.sink({ phase: "complete", direction: "download", loaded: s.loaded, total: s.total });
    }
  }

  /** The attempt failed or was cancelled: end every started direction that has not completed. */
  fail(failure: TransferFailure): void {
    for (const direction of DIRECTIONS) {
      const s = this.state[direction];
      if (!s.started || s.terminal) continue;
      s.terminal = true;
      if (failure.kind === "error") {
        (failure.error as ApiError).transfer ??= {
          direction,
          loaded: s.loaded,
          ...(s.total !== undefined ? { total: s.total } : {}),
        };
      }
      const base = {
        direction,
        attempt: this.attempt,
        loaded: s.loaded,
        ...(s.total !== undefined ? { total: s.total } : {}),
      };
      deliver(
        this.observer,
        failure.kind === "abort"
          ? { phase: "abort", ...base, reason: failure.reason }
          : { phase: "error", ...base, error: failure.error, willRetry: failure.willRetry },
      );
    }
  }
}
