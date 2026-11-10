import { ConfigError } from "../errors/index.js";
import type { TransferControl } from "../types/advanced-transfer.js";

interface Binding {
  pause(): Promise<void>;
  resume(): void;
  cancel(reason?: unknown): void;
  abort(): Promise<void>;
}
const bindings = new WeakMap<TransferControl, { current?: Binding }>();
/** One caller-owned control per active operation; operation results remain native promises. */
export function createTransferControl(): TransferControl {
  const slot: { current?: Binding } = {};
  const control: TransferControl = {
    pause: () => slot.current?.pause() ?? Promise.resolve(),
    resume: () => slot.current?.resume(),
    cancel: (reason) => slot.current?.cancel(reason),
    abort: () =>
      slot.current?.abort() ?? Promise.reject(new ConfigError("No active transfer to abort.")),
  };
  bindings.set(control, slot);
  return Object.freeze(control);
}
export function bindControl(control: TransferControl | undefined, binding: Binding): () => void {
  if (!control) return () => {};
  const slot = bindings.get(control);
  if (!slot) throw new ConfigError("Use createTransferControl() to create a transfer control.");
  if (slot.current)
    throw new ConfigError("Transfer control is already bound to an active operation.");
  slot.current = binding;
  return () => {
    slot.current = undefined;
  };
}
