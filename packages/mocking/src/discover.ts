import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

/** Recursively find directories that contain `meta.json`. */
export async function findDatasetDirs(root: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }

    const hasMeta = entries.includes("meta.json");
    if (hasMeta) {
      found.push(dir);
      return; // leaf dataset folder — do not recurse into nested data dirs
    }

    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const child = join(dir, name);
      const info = await stat(child).catch(() => null);
      if (info?.isDirectory()) {
        await walk(child);
      }
    }
  }

  await walk(root);
  return found;
}

export async function resolveDatasetDir(root: string, id: string): Promise<string | null> {
  const direct = join(root, id);
  try {
    const info = await stat(direct);
    if (info.isDirectory()) {
      await readFile(join(direct, "meta.json"), "utf8");
      return direct;
    }
  } catch {
    // fall through to recursive search
  }

  const dirs = await findDatasetDirs(root);
  for (const dir of dirs) {
    const rel = relative(root, dir).replace(/\\/g, "/");
    if (rel === id) return dir;
    try {
      const meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8")) as { id?: string };
      if (meta.id === id) return dir;
    } catch {
      // skip
    }
  }

  return null;
}
