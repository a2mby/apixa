import type { Dataset } from "../types.js";

const presets = new Map<string, Dataset>();

/** Register a typed preset dataset by id (`mockConfig.type`). */
export function registerDatasetPreset(id: string, dataset: Dataset): void {
  presets.set(id, dataset);
}

export function getDatasetPreset(id: string): Dataset | undefined {
  return presets.get(id);
}

export function listDatasetPresetIds(): string[] {
  return [...presets.keys()].sort();
}

/** Test helper. */
export function clearDatasetPresets(): void {
  presets.clear();
}
