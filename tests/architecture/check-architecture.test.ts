import { spawn } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const repo = resolve(__dirname, "../..");
const script = join(repo, "scripts/check-architecture.mjs");
const copies: string[] = [];

/** A throwaway copy of everything the checker reads (sources, manifests, built output). */
function checkout(): string {
  const dir = mkdtempSync(join(tmpdir(), "apixa-arch-"));
  copies.push(dir);
  const keep = (src: string) => !src.includes("node_modules");
  for (const path of ["packages", "src", "dist", "package.json", "tsconfig.publish.json"]) {
    if (existsSync(join(repo, path)))
      cpSync(join(repo, path), join(dir, path), { recursive: true, filter: keep });
  }
  return dir;
}

/** Async on purpose: a blocking spawn starves the worker's RPC and times out on a loaded runner. */
function run(dir: string): Promise<{ status: number | null; output: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn("node", [script], {
      env: { ...process.env, APIXA_ARCH_ROOT: dir },
    });
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (output += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (output += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolveRun({ status, output }));
  });
}

const append = (dir: string, file: string, text: string) => appendFileSync(join(dir, file), text);
const edit = (dir: string, file: string, from: string | RegExp, to: string) => {
  const path = join(dir, file);
  const before = readFileSync(path, "utf8");
  const after = before.replace(from, to);
  expect(after, `${file} was not changed by the mutation`).not.toBe(before);
  writeFileSync(path, after);
};

afterAll(() => {
  for (const dir of copies) rmSync(dir, { recursive: true, force: true });
});

const violations: [string, string, (dir: string) => void][] = [
  [
    "emitted-cycle",
    "cycle",
    (d) => {
      append(d, "dist/index.js", '\nimport "./core.js";\n');
      append(d, "dist/core.js", '\nimport "./index.js";\n');
    },
  ],
  [
    "private-runtime-import-in-tarball",
    "private-in-dist",
    (d) => append(d, "dist/index.js", '\nimport "@apixa/core";\n'),
  ],
  [
    "duplicate-core-in-distribution",
    "duplicate-core",
    (d) => append(d, "dist/core.js", "\nclass HttpError extends Error {}\n"),
  ],
  [
    "private-runtime-dependency",
    "private-dependency",
    (d) =>
      edit(
        d,
        "package.json",
        '"name": "apixa",',
        '"name": "apixa", "dependencies": { "@apixa/core": "1.0.0-rc.0" },',
      ),
  ],
  [
    "react-peer-becomes-mandatory",
    "release",
    (d) => edit(d, "package.json", '"optional": true', '"optional": false'),
  ],
  [
    "missing-distribution-chunk",
    "dist-resolve",
    (d) => append(d, "dist/core.js", '\nimport "./missing.js";\n'),
  ],
  [
    "advanced-becomes-client-boundary",
    "client-directive",
    (d) => edit(d, "dist/react/advanced.js", /^/, '\"use client\";\n'),
  ],
  [
    "emitted-root-loads-react",
    "facade-dist",
    (d) => append(d, "dist/core.js", '\nimport "react";\n'),
  ],
  [
    "react-in-core",
    "external-dependency",
    (d) => append(d, "packages/core/src/index.ts", '\nimport "react";\n'),
  ],
  [
    "core-imports-mocking",
    "dependency-direction",
    (d) => append(d, "packages/core/src/mock/datasets.ts", '\nimport "@apixa/mocking";\n'),
  ],
  [
    "shared-imports-a-framework",
    "external-dependency",
    (d) => append(d, "packages/internal/shared/src/keys.ts", '\nimport "react";\n'),
  ],
  [
    "react-reaches-react-from-the-server-entry",
    "react-in-server-entry",
    (d) => append(d, "packages/react/src/keys.ts", '\nimport "react";\n'),
  ],
  [
    "facade-holds-logic",
    "facade-logic",
    (d) => append(d, "src/core.ts", "\nexport const notAReExport = 1;\n"),
  ],
  [
    "facade-react-drops-a-name",
    "facade-parity",
    (d) => edit(d, "src/react/index.ts", /\n  useResource,/, ""),
  ],
  [
    "private-package-in-built-react",
    "private-in-dist",
    (d) => append(d, "packages/react/dist/index.js", '\nimport "@apixa/internal-shared";\n'),
  ],
  [
    "node-builtin-reaches-an-edge-safe-entry",
    "node-leak",
    (d) => append(d, "packages/mocking/src/register.ts", '\nimport "node:fs";\n'),
  ],
  [
    "node-global-in-built-core",
    "node-leak",
    (d) => append(d, "packages/core/dist/index.js", "\nvoid process.env.SECRET;\n"),
  ],
  [
    "facade-core-declarations-mention-react",
    "facade-dist",
    (d) => append(d, "dist/core.d.ts", "\nimport 'react';\n"),
  ],
  [
    "mocking-bundles-its-own-core",
    "duplicate-core",
    (d) => append(d, "packages/mocking/dist/index.js", "\nclass ApiError extends Error {}\n"),
  ],
  [
    "internal-package-becomes-public",
    "private-package",
    (d) => edit(d, "packages/react/package.json", '"private": true', '"private": false'),
  ],
  [
    "react-package-loses-use-client",
    "client-directive",
    (d) => edit(d, "packages/react/dist/index.js", '"use client";', ""),
  ],
  [
    "private-shared-package-reexported-wholesale",
    "public-exposure",
    (d) =>
      append(d, "packages/react/src/advanced.ts", '\nexport * from "@apixa/internal-shared";\n'),
  ],
  [
    "react-becomes-a-core-dependency",
    "release",
    (d) =>
      edit(
        d,
        "packages/core/package.json",
        '"sideEffects": false,',
        '"sideEffects": false,\n  "dependencies": { "react": "^19.0.0" },',
      ),
  ],
];

// Each case copies the build and runs the checker in a child process; a loaded runner needs headroom.
describe("architecture checker", { timeout: 60_000 }, () => {
  it("passes on an unmodified checkout", async () => {
    const { status, output } = await run(checkout());
    expect(output).toContain("Architecture check passed");
    expect(status).toBe(0);
  });

  // Mutations of built output need `pnpm build` first; `pnpm verify` always builds before testing.
  const built =
    existsSync(join(repo, "dist/index.js")) && existsSync(join(repo, "packages/react/dist"));
  it.for(violations)("rejects: %s", async ([, rule, mutate], { skip }) => {
    if (!built && /dist\//.test(mutate.toString())) skip();
    const dir = checkout();
    mutate(dir);
    const { status, output } = await run(dir);
    expect(status, output).toBe(1);
    expect(output).toContain(`[${rule}]`);
  });
});
