// npm-installed TYPE consumers for the single published `apixa` package.
//
// Regression for the v1.0.0-rc.0 report: with `@tanstack/react-query` unresolvable from apixa's
// declarations, `useResource` / `useResourceQuery` silently returned `any`. Every project below is
// created OUTSIDE the pnpm workspace, installed with **npm** from the packed tarball, and checked
// with real `tsc` over a matrix of TypeScript versions, module resolution modes and skipLibCheck.
//
//   core-only        no React, no TanStack: must compile cleanly (skipLibCheck on and off)
//   react + peers    fully typed: whole-result and per-member `any` detection, exact types
//   react, no tanstack  must FAIL, detectably: the typed fixture errors with a message naming the
//                    fix, and (skipLibCheck: false) TS2307 points at the missing module
//
// Nothing is published. Temporary projects are removed at the end.
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CORE_ONLY, REACT_TYPED } from "./lib/type-consumer-fixtures.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const temporary = mkdtempSync(join(tmpdir(), "apixa-type-consumers-"));
const TS_VERSIONS = ["5.5.4", "5.9.3", "latest"];
const RESOLUTIONS = ["bundler", "nodenext"];
const MARKER = "run: npm install @tanstack/react-query";

const npm = (cwd, ...args) => {
  console.log(`\n$ npm ${args.join(" ")}  (${cwd.replace(temporary, "<tmp>")})`);
  execFileSync("npm", [...args, "--no-audit", "--no-fund", "--loglevel=error"], {
    cwd,
    stdio: "inherit",
  });
};

function tsconfig(directory, name, { moduleResolution, skipLibCheck, include }) {
  writeFileSync(
    join(directory, name),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: moduleResolution === "bundler" ? "ESNext" : "NodeNext",
        moduleResolution: moduleResolution === "bundler" ? "Bundler" : "NodeNext",
        lib: ["ES2022", "DOM"],
        strict: true,
        noEmit: true,
        jsx: "react-jsx",
        skipLibCheck,
      },
      include,
    }),
  );
}

function tsc(tool, directory, config) {
  const result = spawnSync("node", [join(tool, "node_modules/typescript/bin/tsc"), "-p", config], {
    cwd: directory,
    encoding: "utf8",
  });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

const results = [];
function record(label, ok, detail = "") {
  results.push({ label, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

try {
  const packs = join(temporary, "packs");
  mkdirSync(packs);
  console.log("$ pnpm pack");
  execFileSync("pnpm", ["pack", "--pack-destination", packs], { cwd: root, stdio: "inherit" });
  const tarball = join(packs, `apixa-${version}.tgz`);

  // One TypeScript toolchain per version, shared by every project.
  const tools = {};
  for (const ts of TS_VERSIONS) {
    const tool = join(temporary, `ts-${ts}`);
    mkdirSync(tool);
    writeFileSync(join(tool, "package.json"), '{"private":true}');
    npm(tool, "install", `typescript@${ts}`);
    tools[ts] = tool;
  }

  function project(name, dependencies, devDependencies, files) {
    const directory = join(temporary, name);
    mkdirSync(directory);
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({ private: true, type: "module", dependencies, devDependencies }),
    );
    for (const [file, text] of Object.entries(files)) writeFileSync(join(directory, file), text);
    npm(directory, "install");
    return directory;
  }

  // --- A. Core only ---------------------------------------------------------------------------
  const coreDir = project("core-only", { apixa: `file:${tarball}` }, {}, { "main.ts": CORE_ONLY });
  for (const name of ["react", "@tanstack/react-query"])
    assert.ok(
      !existsSync(join(coreDir, "node_modules", name)),
      `core-only project must not install ${name}`,
    );
  for (const ts of TS_VERSIONS)
    for (const moduleResolution of RESOLUTIONS)
      for (const skipLibCheck of [true, false]) {
        tsconfig(coreDir, "tsconfig.json", {
          moduleResolution,
          skipLibCheck,
          include: ["main.ts"],
        });
        const r = tsc(tools[ts], coreDir, "tsconfig.json");
        record(
          `core-only  ts@${ts} ${moduleResolution} skipLibCheck=${skipLibCheck}`,
          r.code === 0,
          r.code === 0 ? "" : `\n${r.output}`,
        );
      }

  // --- B + C. React 18 / 19, with and without TanStack ------------------------------------------
  for (const major of [18, 19]) {
    const react = {
      react: major === 18 ? "18.3.1" : "19.1.1",
      "react-dom": major === 18 ? "18.3.1" : "19.1.1",
    };
    const types = {
      "@types/react": major === 18 ? "^18.3.0" : "^19.1.13",
      "@types/react-dom": major === 18 ? "^18.3.0" : "^19.1.9",
    };
    const tanstack = major === 18 ? "5.90.1" : "latest";
    const full = project(
      `react${major}-with-peers`,
      { apixa: `file:${tarball}`, ...react, "@tanstack/react-query": tanstack },
      types,
      { "app.tsx": REACT_TYPED },
    );
    const missing = project(
      `react${major}-missing-tanstack`,
      { apixa: `file:${tarball}`, ...react },
      types,
      { "app.tsx": REACT_TYPED },
    );
    assert.ok(
      !existsSync(join(missing, "node_modules/@tanstack/react-query")),
      "scenario C must not install TanStack",
    );
    assert.ok(existsSync(join(full, "node_modules/@tanstack/react-query")), "peers installed");

    for (const ts of TS_VERSIONS)
      for (const moduleResolution of RESOLUTIONS)
        for (const skipLibCheck of [true, false]) {
          // Large matrix: React 18 keeps the endpoints, React 19 the whole grid.
          if (major === 18 && ts === "5.9.3") continue;
          const tag = `react${major} ts@${ts} ${moduleResolution} skipLibCheck=${skipLibCheck}`;
          tsconfig(full, "tsconfig.json", { moduleResolution, skipLibCheck, include: ["app.tsx"] });
          const ok = tsc(tools[ts], full, "tsconfig.json");
          record(`with peers      ${tag}`, ok.code === 0, ok.code === 0 ? "" : `\n${ok.output}`);

          tsconfig(missing, "tsconfig.json", {
            moduleResolution,
            skipLibCheck,
            include: ["app.tsx"],
          });
          const bad = tsc(tools[ts], missing, "tsconfig.json");
          const named =
            bad.output.includes("ApixaMissingPeer_Install_tanstack_react_query") ||
            bad.output.includes(MARKER);
          const pointsAtModule = /TS2307[^\n]*@tanstack\/react-query/.test(bad.output);
          record(
            `missing tanstack ${tag}: fails and names the fix`,
            bad.code !== 0 && named,
            bad.code !== 0 && named ? "" : `\n${bad.output.slice(0, 1500)}`,
          );
          if (!skipLibCheck)
            record(`missing tanstack ${tag}: TS2307 on the module`, pointsAtModule);
        }
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} type-consumer checks passed`);
  if (failed.length) process.exitCode = 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
