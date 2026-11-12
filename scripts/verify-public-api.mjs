// Public API contract check against the BUILT output (run `pnpm build` first).
//
// For every public entry of apixa and the private modules used as compatibility references it checks that
//   - the runtime exports (importing the real ESM file) equal the value exports of its `.d.ts`,
//   - the declaration file type-checks on its own (TypeScript, skipLibCheck: false),
//   - the exported names match the committed snapshot (`tests/facade/public-exports.snapshot.json`),
//     so an internal symbol cannot become public by accident (`--update` rewrites the snapshot),
//   - private shared helpers are not exported, and `apixa/*` mirrors the packages it re-exports,
//   - every `import { … } from "apixa…" | "@apixa/…"` in the current docs names a real export.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotFile = join(root, "tests/facade/public-exports.snapshot.json");
const update = process.argv.includes("--update");
const problems = [];
const fail = (message) => problems.push(message);

const PACKAGES = [
  ["apixa", "."],
  ["@apixa/core", "packages/core"],
  ["@apixa/mocking", "packages/mocking"],
  ["@apixa/react", "packages/react"],
];

/** Every public entry: specifier -> built JS and declaration file. */
const entries = new Map();
for (const [name, dir] of PACKAGES) {
  const manifest = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8"));
  assert.ok(
    !Object.keys(manifest.exports).some((key) => /tanstack/i.test(key)),
    `${name} exports a legacy tanstack path`,
  );
  for (const [subpath, target] of Object.entries(manifest.exports)) {
    const specifier = subpath === "." ? name : `${name}/${subpath.slice(2)}`;
    entries.set(specifier, {
      js: join(root, dir, target.import),
      dts: join(root, dir, target.types),
    });
  }
}
for (const [specifier, { js, dts }] of entries) {
  assert.ok(existsSync(js), `${specifier}: missing ${relative(root, js)} (run pnpm build)`);
  assert.ok(existsSync(dts), `${specifier}: missing ${relative(root, dts)} (run pnpm build)`);
}

// ---- Declarations: exported symbols and their diagnostics -----------------------------------------------------
const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  strict: true,
  noEmit: true,
  skipLibCheck: false,
  types: [],
  jsx: ts.JsxEmit.ReactJSX,
};
const program = ts.createProgram(
  [...entries.values()].map((e) => e.dts),
  compilerOptions,
);
const checker = program.getTypeChecker();

const declared = new Map();
for (const [specifier, { dts }] of entries) {
  const source = program.getSourceFile(dts);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  const values = [];
  const types = [];
  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    const resolved =
      symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const isValue = (resolved.flags & ts.SymbolFlags.Value) !== 0;
    (isValue ? values : types).push(symbol.name);
  }
  declared.set(specifier, { values: values.sort(), types: types.sort() });
}

// Check the whole declaration closure, including preserved internal modules and peers.
for (const d of ts.getPreEmitDiagnostics(program)) {
  fail(
    `${d.file ? relative(root, d.file.fileName) : "declarations"}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`,
  );
}

// ---- Runtime exports equal declared values ------------------------------------------------------------------------------
const runtime = new Map();
for (const [specifier, { js }] of entries) {
  const module = await import(pathToFileURL(js).href);
  runtime.set(specifier, Object.keys(module).sort());
  const values = declared.get(specifier).values;
  const missingAtRuntime = values.filter((n) => !runtime.get(specifier).includes(n));
  const undeclared = runtime.get(specifier).filter((n) => !values.includes(n));
  if (missingAtRuntime.length)
    fail(`${specifier}: declared but not exported at runtime: ${missingAtRuntime.join(", ")}`);
  if (undeclared.length)
    fail(`${specifier}: exported at runtime but not declared: ${undeclared.join(", ")}`);
}

// ---- Facade mirrors its packages; curated root; private helpers stay private ---------------------------------------
const same = (a, b, label) => {
  try {
    assert.deepEqual(a, b);
  } catch {
    fail(`${label}: facade and package export different names`);
  }
};
const MIRRORS = [
  ["apixa/core", "@apixa/core"],
  ["apixa/mocking", "@apixa/mocking"],
  ["apixa/mocking/register", "@apixa/mocking/register"],
  ["apixa/mocking/node", "@apixa/mocking/node"],
  ["apixa/mocking/datasets", "@apixa/mocking/datasets"],
  ...["users", "products", "companies", "orders", "posts", "comments"].map((n) => [
    `apixa/mocking/datasets/${n}`,
    `@apixa/mocking/datasets/${n}`,
  ]),
  ["apixa/react", "@apixa/react"],
  ["apixa/react/advanced", "@apixa/react/advanced"],
];
for (const [facade, pkg] of MIRRORS) {
  assert.ok(entries.has(facade) && entries.has(pkg), `unknown mirror ${facade} / ${pkg}`);
  same(runtime.get(facade), runtime.get(pkg), `${facade} runtime`);
  same(declared.get(facade), declared.get(pkg), `${facade} declarations`);
}
const curated = JSON.parse(
  readFileSync(join(root, "tests/facade/curated-root-exports.json"), "utf8"),
);
same(runtime.get("apixa"), curated, "apixa root runtime vs the curated contract");
same(declared.get("apixa").values, curated, "apixa root declarations vs the curated contract");

const sharedSource = ts.createSourceFile(
  "shared",
  readFileSync(join(root, "packages/internal/shared/src/index.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const sharedNames = [];
for (const st of sharedSource.statements) {
  if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
    for (const el of st.exportClause.elements) sharedNames.push(el.name.text);
  }
}
// Documented public wrappers over shared code (kept by name for compatibility with earlier releases).
const PUBLIC_BY_DESIGN = new Set(["createResourceKeys", "describeOperations", "OperationInfo"]);
for (const [specifier, { values, types }] of declared) {
  for (const name of [...values, ...types]) {
    if (sharedNames.includes(name) && !PUBLIC_BY_DESIGN.has(name)) {
      fail(`${specifier} exposes private shared helper ${name}`);
    }
    if (/internal/i.test(name)) fail(`${specifier} exposes an internal-looking name ${name}`);
  }
}

// ---- Snapshot ------------------------------------------------------------------------------------------------------------------------
const current = Object.fromEntries(
  [...declared]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([specifier, names]) => [specifier, names]),
);
if (update) {
  writeFileSync(snapshotFile, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Updated ${relative(root, snapshotFile)}`);
} else if (!existsSync(snapshotFile)) {
  fail(`missing ${relative(root, snapshotFile)}; run: node scripts/verify-public-api.mjs --update`);
} else {
  const saved = JSON.parse(readFileSync(snapshotFile, "utf8"));
  for (const specifier of new Set([...Object.keys(saved), ...Object.keys(current)])) {
    for (const kind of ["values", "types"]) {
      const before = saved[specifier]?.[kind] ?? [];
      const after = current[specifier]?.[kind] ?? [];
      const added = after.filter((n) => !before.includes(n));
      const removed = before.filter((n) => !after.includes(n));
      if (added.length)
        fail(`${specifier}: new public ${kind}: ${added.join(", ")} (review, then run --update)`);
      if (removed.length)
        fail(
          `${specifier}: removed public ${kind}: ${removed.join(", ")} (breaking; review, then run --update)`,
        );
    }
  }
}

// ---- Documentation imports name real exports -----------------------------------------------------------------------------
const docs = [
  "README.md",
  "CONTRIBUTING.md",
  "packages/core/README.md",
  "packages/mocking/README.md",
  "packages/react/README.md",
  "docs/public-api.md",
  "examples/frontends/query-ssr-next/README.md",
].filter((f) => existsSync(join(root, f)));
let checkedImports = 0;
for (const file of docs) {
  const text = readFileSync(join(root, file), "utf8");
  for (const match of text.matchAll(
    /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g,
  )) {
    const [, names, specifier] = match;
    if (!/^(apixa|@apixa\/)/.test(specifier)) continue;
    const entry = declared.get(specifier);
    if (!entry) {
      fail(`${file}: imports from unknown entry "${specifier}"`);
      continue;
    }
    for (const raw of names.split(",")) {
      const name = raw
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
        .trim();
      if (!name || name === "...") continue;
      checkedImports++;
      if (!entry.values.includes(name) && !entry.types.includes(name)) {
        fail(`${file}: \`${name}\` is not exported by "${specifier}"`);
      }
    }
  }
  for (const match of text.matchAll(/import\s+["']((?:@?apixa)[^"']*)["']/g)) {
    if (!entries.has(match[1])) fail(`${file}: side-effect import of unknown entry "${match[1]}"`);
  }
}

if (problems.length) {
  console.error(`Public API check failed (${problems.length}):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `Public API verified: 14 public entries + 13 private reference entries (runtime = declarations = snapshot), ` +
    `${checkedImports} documented imports resolve.`,
);
