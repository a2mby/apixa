import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the local datasets root.
 * Prefers `basePath`, then `APIXA_DATASETS_DIR`, then `./datasets` from cwd,
 * then the monorepo `datasets/` folder relative to this package when present.
 */
export function resolveDatasetsRoot(basePath?: string): string {
  if (basePath) {
    return resolve(basePath);
  }

  if (process.env.APIXA_DATASETS_DIR) {
    return resolve(process.env.APIXA_DATASETS_DIR);
  }

  const fromCwd = resolve(process.cwd(), "datasets");
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  // packages/mocking/dist → ../../../datasets (repo root in the monorepo)
  const fromPackage = resolve(dirname(fileURLToPath(import.meta.url)), "../../../datasets");
  if (existsSync(fromPackage)) {
    return fromPackage;
  }

  return fromCwd;
}
