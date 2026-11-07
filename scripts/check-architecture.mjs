// Architecture verification. Builds the real module graph of every workspace package with the
// TypeScript compiler (parser + module resolution), then enforces the rules in
// docs/architecture.md ("Architecture contract"). Read-only; run after `pnpm build` so the
// published `dist` output is checked too (the dist checks are skipped when `dist` is absent).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// `APIXA_ARCH_ROOT` points the checker at another checkout (tests mutate a copy to prove violations fail).
const root = process.env.APIXA_ARCH_ROOT
  ? resolve(process.env.APIXA_ARCH_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const violations = [];
const fail = (rule, message) => violations.push(`[${rule}] ${message}`);
const rel = (file) => relative(root, file);

/**
 * Package table. `workspace` lists the only workspace packages a package may import; `external`
 * lists the only non-workspace, non-builtin bare specifiers it may import (package names, matched
 * with or without a subpath). Everything else is a violation.
 */
const PACKAGES = {
  "@apixa/core": { dir: "packages/core", workspace: [], external: [], publishable: false },
  "@apixa/internal-shared": {
    dir: "packages/internal/shared",
    workspace: ["@apixa/core"],
    external: [],
    publishable: false,
  },
  "@apixa/mocking": {
    dir: "packages/mocking",
    workspace: ["@apixa/core"],
    external: [],
    publishable: false,
  },
  "@apixa/react": {
    dir: "packages/react",
    workspace: ["@apixa/core", "@apixa/internal-shared"],
    external: ["react", "@tanstack/react-query"],
    publishable: false,
  },
  // The facade is the repository root package. It may only re-export the public packages.
  apixa: {
    dir: ".",
    workspace: ["@apixa/core", "@apixa/mocking", "@apixa/react"],
    external: [],
    publishable: true,
  },
};

/** Entry files that must stay free of React/TanStack and Node built-ins (closure is checked). */
const FRAMEWORK_FREE_ENTRIES = {
  "@apixa/core": ["src/index.ts"],
  "@apixa/mocking": [
    "src/index.ts",
    "src/register.ts",
    "src/datasets.ts",
    ...readdirSync(join(root, "packages/mocking/src/dataset-modules")).map(
      (f) => `src/dataset-modules/${f}`,
    ),
  ],
};
const FACADE_FRAMEWORK_FREE = [
  "src/index.ts",
  "src/core.ts",
  "src/mocking/index.ts",
  "src/mocking/register.ts",
  ...readdirSync(join(root, "src/mocking/datasets")).map((f) => `src/mocking/datasets/${f}`),
];
FRAMEWORK_FREE_ENTRIES.apixa = FACADE_FRAMEWORK_FREE;
/** Entries that must not reach React itself (they may use TanStack's React-free query core). */
const REACT_FREE_ENTRIES = {
  "@apixa/react": ["src/advanced.ts"],
  apixa: ["src/react/advanced.ts"],
};
const REACT_RUNTIME = /^(react|react-dom)(\/|$)/;
/** The only entry allowed to reach Node built-ins. */
const NODE_ENTRIES = { "@apixa/mocking": ["src/node.ts"] };
const FRAMEWORK_PACKAGES =
  /^(react|react-dom|react-native|vue|@angular\/.*|svelte|solid-js|next|@tanstack\/.*)(\/|$)/;
/** Non-source repo-root directory that Mocking may reach by relative path (JSON fixtures). */
const DATA_ROOT = join(root, "datasets") + "/";

const isBuiltin = (spec) => spec.startsWith("node:") || builtinModules.includes(spec.split("/")[0]);
const packageOf = (spec) =>
  spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];

// --- Module graph -----------------------------------------------------------------------------

function listSources(dir) {
  const out = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, item.name);
    if (item.isDirectory()) out.push(...listSources(full));
    else if (/\.(ts|tsx)$/.test(item.name) && !item.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/** Imports of one file: { spec, kind: "static" | "type" | "dynamic" }. */
function readImports(file) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const found = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly =
        clause &&
        (clause.isTypeOnly ||
          (!clause.name &&
            clause.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((e) => e.isTypeOnly)));
      found.push({ spec: node.moduleSpecifier.text, kind: typeOnly ? "type" : "static" });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push({ spec: node.moduleSpecifier.text, kind: node.isTypeOnly ? "type" : "static" });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found.push({ spec: node.arguments[0].text, kind: "dynamic" });
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      found.push({ spec: node.argument.literal.text, kind: "type" });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const manifests = Object.fromEntries(
  Object.entries(PACKAGES).map(([name, info]) => [
    name,
    JSON.parse(readFileSync(join(root, info.dir, "package.json"), "utf8")),
  ]),
);

/** `@apixa/x/sub` → entry file under that package's src, from its exports map. */
function resolveWorkspace(spec) {
  const name = packageOf(spec);
  const info = PACKAGES[name];
  if (!info) return null;
  const subpath = spec === name ? "." : `.${spec.slice(name.length)}`;
  const exportsMap = manifests[name].exports ?? {};
  const keys = Object.keys(exportsMap);
  let target = exportsMap[subpath];
  if (target === undefined) {
    // Wildcard exports ("./datasets/*").
    for (const key of keys) {
      if (!key.endsWith("/*")) continue;
      const prefix = key.slice(0, -1);
      if (subpath.startsWith(prefix)) {
        target = exportsMap[key];
        const tail = subpath.slice(prefix.length);
        target = typeof target === "string" ? target.replace("*", tail) : target;
      }
    }
  }
  if (target === undefined) return { name, error: `"${subpath}" is not in ${name}'s exports map` };
  const file = typeof target === "string" ? target : (target.import ?? target.default);
  if (info.dir && file.startsWith("./src/")) return { name, file: join(root, info.dir, file) };
  // dist-based export: map ./dist/foo.js to the same-named source file where one exists.
  const base = file.replace(/^\.\/dist\//, "").replace(/\.(d\.ts|js)$/, "");
  for (const candidate of [`src/${base}.ts`, `src/${base}.tsx`]) {
    if (existsSync(join(root, info.dir, candidate)))
      return { name, file: join(root, info.dir, candidate) };
  }
  // Known source layouts whose dist names differ from their source names.
  const alias = {
    datasets: "src/datasets.ts",
    "dataset-modules/users": "src/dataset-modules/users.ts",
  };
  if (alias[base]) return { name, file: join(root, info.dir, alias[base]) };
  return { name }; // resolved to the package, not to a file: still a valid dependency edge
}

const graph = new Map(); // file -> { pkg, edges: [{ spec, kind, to?: file, external?: string, workspace?: string }] }
const packageEdges = new Map(); // pkg -> Set(pkg)

for (const [name, info] of Object.entries(PACKAGES)) {
  const srcDir = join(root, info.dir, "src");
  packageEdges.set(name, new Set());
  for (const file of listSources(srcDir)) {
    const edges = [];
    for (const { spec, kind } of readImports(file)) {
      const edge = { spec, kind };
      if (spec.startsWith(".")) {
        const target = resolve(dirname(file), spec);
        if (/\.json$/.test(target)) {
          edge.data = target;
          if (!target.startsWith(DATA_ROOT) && !target.startsWith(srcDir)) {
            fail("private-import", `${rel(file)} imports ${spec}, outside its package`);
          }
        } else {
          const ts_ = [target.replace(/\.js$/, ".ts"), target.replace(/\.js$/, ".tsx"), target];
          const resolved = ts_.find((p) => existsSync(p) && statSync(p).isFile());
          if (!resolved) fail("resolve", `${rel(file)} imports ${spec}, which does not resolve`);
          else if (!resolved.startsWith(srcDir + "/")) {
            fail(
              "private-import",
              `${rel(file)} imports ${spec}, a private path outside ${name}/src`,
            );
          } else edge.to = resolved;
        }
      } else if (isBuiltin(spec)) {
        edge.builtin = spec;
      } else if (PACKAGES[packageOf(spec)]) {
        const target = packageOf(spec);
        edge.workspace = target;
        if (/\/src(\/|$)/.test(spec)) {
          fail(
            "private-import",
            `${rel(file)} imports ${spec}: never import another package's source`,
          );
        }
        const resolved = resolveWorkspace(spec);
        if (resolved?.error)
          fail("private-import", `${rel(file)} imports ${spec}: ${resolved.error}`);
        if (resolved?.file && target !== name) edge.wsTo = resolved.file;
        if (target !== name) {
          packageEdges.get(name).add(target);
          if (!info.workspace.includes(target)) {
            fail(
              "dependency-direction",
              `${rel(file)} imports ${target}, which ${name} may not depend on`,
            );
          }
        }
      } else {
        edge.external = packageOf(spec);
        if (!info.external.includes(edge.external)) {
          fail("external-dependency", `${rel(file)} imports "${spec}", not allowed for ${name}`);
        }
      }
      edges.push(edge);
    }
    graph.set(file, { pkg: name, edges });
  }
}

// --- Rule: workspace dependencies declared consistently -----------------------------------------

for (const [name, info] of Object.entries(PACKAGES)) {
  const m = manifests[name];
  const declared = { ...m.dependencies, ...m.peerDependencies, ...m.devDependencies };
  for (const dep of packageEdges.get(name)) {
    if (name !== "apixa" && !(dep in declared))
      fail("manifest", `${name} imports ${dep} but does not declare it`);
  }
  for (const dep of Object.keys({
    ...m.dependencies,
    ...m.peerDependencies,
    ...m.optionalDependencies,
  })) {
    if (dep in PACKAGES && !PACKAGES[dep].publishable) {
      fail(
        "private-dependency",
        `${name} lists private ${dep} as a runtime/peer dependency; it must be a devDependency (bundled)`,
      );
    }
  }
  if (info.publishable === false && m.private !== true) {
    fail("private-package", `${name} must be "private": true`);
  }
}

// --- Rule: no circular dependencies ---------------------------------------------------------------

function findCycle(nodes, neighbours) {
  const state = new Map();
  const stack = [];
  const visit = (node) => {
    state.set(node, 1);
    stack.push(node);
    for (const next of neighbours(node)) {
      if (state.get(next) === 1) return [...stack.slice(stack.indexOf(next)), next];
      if (!state.has(next)) {
        const cycle = visit(next);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    state.set(node, 2);
    return null;
  };
  for (const node of nodes)
    if (!state.has(node)) {
      const cycle = visit(node);
      if (cycle) return cycle;
    }
  return null;
}

const packageCycle = findCycle([...packageEdges.keys()], (p) => packageEdges.get(p));
if (packageCycle) fail("cycle", `package cycle: ${packageCycle.join(" -> ")}`);
// Type-only and dynamic imports are erased or deferred, so only static runtime edges form cycles.
const fileCycle = findCycle(graph.keys(), (file) =>
  graph
    .get(file)
    .edges.filter((e) => e.kind === "static" && e.to)
    .map((e) => e.to),
);
if (fileCycle) fail("cycle", `module cycle: ${fileCycle.map(rel).join(" -> ")}`);

// --- Rule: framework and Node leakage by entry closure -----------------------------------------

function closure(entries) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || !graph.has(file)) continue;
    seen.add(file);
    for (const edge of graph.get(file).edges) {
      if (edge.to) queue.push(edge.to);
      if (edge.wsTo) queue.push(edge.wsTo);
    }
  }
  return seen;
}

for (const [name, entries] of Object.entries(FRAMEWORK_FREE_ENTRIES)) {
  const files = entries.map((e) => join(root, PACKAGES[name].dir, e));
  for (const file of closure(files)) {
    for (const edge of graph.get(file).edges) {
      if (edge.external && FRAMEWORK_PACKAGES.test(edge.spec)) {
        fail(
          "framework-leak",
          `${rel(file)} (reachable from a framework-independent ${name} entry) imports ${edge.spec}`,
        );
      }
      if (edge.builtin) {
        fail(
          "node-leak",
          `${rel(file)} (reachable from an edge-safe ${name} entry) imports ${edge.spec}`,
        );
      }
      if (edge.workspace && edge.workspace !== name && edge.workspace === "@apixa/react") {
        fail("framework-leak", `${rel(file)} imports the React integration`);
      }
    }
  }
}
for (const [name, entries] of Object.entries(REACT_FREE_ENTRIES)) {
  const files = entries.map((e) => join(root, PACKAGES[name].dir, e));
  for (const file of closure(files)) {
    for (const edge of graph.get(file).edges) {
      if (edge.external && REACT_RUNTIME.test(edge.spec)) {
        fail(
          "react-in-server-entry",
          `${rel(file)} (reachable from the server-safe ${name} entry ${entries.join(", ")}) imports ${edge.spec}`,
        );
      }
    }
  }
}

// Node built-ins are confined to the declared Node entries' closure, per package.
for (const [file, { pkg, edges }] of graph) {
  const nodeFiles = closure((NODE_ENTRIES[pkg] ?? []).map((e) => join(root, PACKAGES[pkg].dir, e)));
  for (const edge of edges) {
    if (edge.builtin && !nodeFiles.has(file)) {
      fail(
        "node-leak",
        `${rel(file)} imports ${edge.spec} but is not reachable only from a Node entry of ${pkg}`,
      );
    }
  }
}

// --- Rule: lazy datasets -----------------------------------------------------------------------

for (const [file, { edges }] of graph) {
  for (const edge of edges) {
    if (edge.data && edge.kind === "static" && !/dataset-modules|datasets\.ts$/.test(file)) {
      fail(
        "eager-dataset",
        `${rel(file)} statically imports ${rel(edge.data)}; named datasets must load lazily`,
      );
    }
  }
}

// --- Rule: no accidental public exposure of internals ----------------------------------------------

const publicEntries = new Set();
for (const [name, info] of Object.entries(PACKAGES)) {
  if (name === "@apixa/internal-shared") continue;
  for (const [subpath, target] of Object.entries(manifests[name].exports ?? {})) {
    const resolved = resolveWorkspace(subpath === "." ? name : `${name}/${subpath.slice(2)}`);
    if (resolved?.file) publicEntries.add(resolved.file);
    void target;
  }
}
for (const file of publicEntries) {
  const entry = graph.get(file);
  for (const edge of entry?.edges ?? []) {
    // Entry files re-export other package modules directly (`export … from`); a private workspace
    // package must never be re-exported wholesale (`export *`) from a public entry.
    if (edge.workspace === "@apixa/internal-shared") {
      const text = readFileSync(file, "utf8");
      const star = new RegExp(`export\\s+(type\\s+)?\\*\\s+from\\s+["']${edge.spec}["']`);
      if (star.test(text))
        fail("public-exposure", `${rel(file)} re-exports all of private ${edge.workspace}`);
    }
  }
}

// --- Rule: the facade only re-exports, and its entries match its export map ----------------------

function exportedNames(file) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const names = new Set();
  for (const st of source.statements) {
    if (!ts.isExportDeclaration(st) || !st.exportClause || !ts.isNamedExports(st.exportClause))
      continue;
    for (const el of st.exportClause.elements) names.add(el.name.text);
  }
  return names;
}
for (const [file, { pkg }] of graph) {
  if (pkg !== "apixa") continue;
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  for (const st of source.statements) {
    const reexport = ts.isExportDeclaration(st) && st.moduleSpecifier;
    const sideEffect = ts.isImportDeclaration(st) && !st.importClause;
    const bareExport = ts.isExportDeclaration(st) && !st.moduleSpecifier && !st.exportClause;
    const emptyExport =
      ts.isExportDeclaration(st) && !st.moduleSpecifier && st.exportClause?.elements.length === 0;
    const directive = ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression);
    if (!reexport && !sideEffect && !bareExport && !emptyExport && !directive) {
      fail(
        "facade-logic",
        `${rel(file)} must only re-export, but declares ${ts.SyntaxKind[st.kind]}`,
      );
    }
  }
}
{
  // `apixa/react` must expose exactly the names `@apixa/react` does, as named exports.
  const reactFacade = exportedNames(join(root, "src/react/index.ts"));
  const reactPackage = exportedNames(join(root, "packages/react/src/index.ts"));
  for (const n of reactPackage)
    if (!reactFacade.has(n)) fail("facade-parity", `apixa/react is missing ${n} from @apixa/react`);
  for (const n of reactFacade)
    if (!reactPackage.has(n))
      fail("facade-parity", `apixa/react exports ${n}, which @apixa/react does not`);
  const exportsMap = manifests.apixa.exports ?? {};
  for (const [subpath, target] of Object.entries(exportsMap)) {
    if (/tanstack/i.test(subpath)) fail("facade-exports", `apixa exports legacy path ${subpath}`);
    const base = target.import.replace(/^\.\/dist\//, "").replace(/\.js$/, "");
    if (!existsSync(join(root, `src/${base}.ts`)))
      fail("facade-exports", `apixa export ${subpath} has no source src/${base}.ts`);
    if (target.types !== `./dist/${base}.d.ts`)
      fail("facade-exports", `apixa export ${subpath} has a mismatched types path`);
  }
}

// --- Rule: exactly one public distribution ------------------------------------------------------
{
  const m = manifests.apixa;
  if (m.private) fail("release", "apixa must be public");
  if (m.type !== "module" || m.engines?.node !== ">=22")
    fail("release", "apixa must be ESM, Node >=22");
  if (!m.files?.includes("dist")) fail("release", "apixa must publish dist");
  if (m.publishConfig?.tag !== "next" || m.publishConfig?.access !== "public")
    fail("release", "RC must use public access and next tag");
  for (const group of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
    "devDependencies",
  ]) {
    for (const [dep, range] of Object.entries(m[group] ?? {})) {
      if (dep.startsWith("@apixa/") || /^(workspace:|link:|file:)/.test(range)) {
        fail("release", `apixa ${group}.${dep} contains a workspace-only dependency`);
      }
    }
  }
  for (const name of ["@apixa/core", "@apixa/mocking"]) {
    for (const dep of Object.keys({
      ...manifests[name].dependencies,
      ...manifests[name].peerDependencies,
    })) {
      if (FRAMEWORK_PACKAGES.test(dep)) fail("release", `${name} must not depend on ${dep}`);
    }
  }
  for (const dep of ["react", "@tanstack/react-query"]) {
    if (
      !m.peerDependencies?.[dep] ||
      !m.peerDependenciesMeta?.[dep]?.optional ||
      dep in (m.dependencies ?? {})
    ) {
      fail("release", `apixa must declare ${dep} only as an optional peer`);
    }
  }
  // Source imports are build aliases, not installed private dependencies of the public package.
  const config = JSON.parse(readFileSync(join(root, "tsconfig.publish.json"), "utf8"));
  for (const dep of packageEdges.get("apixa")) {
    if (!config.compilerOptions?.paths?.[dep])
      fail("manifest", `missing source build alias for ${dep}`);
  }
}

// --- Rule: built output has no unresolved private specifiers (needs a prior build) ------------------

function listBuilt(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, item.name);
    if (item.isDirectory()) out.push(...listBuilt(full));
    else if (/\.(js|d\.ts)$/.test(item.name)) out.push(full);
  }
  return out;
}
// Parse imports rather than matching emitted formatting; covers declarations and dynamic imports.
const specifiersOf = (text) => {
  const source = ts.createSourceFile("output.ts", text, ts.ScriptTarget.Latest, true);
  const found = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      found.push(node.moduleSpecifier.text);
    else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      found.push(node.argument.literal.text);
    else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ts.isStringLiteral(node.arguments[0])
    )
      found.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};
const builtDirs = [
  ["@apixa/core", "packages/core/dist"],
  ["@apixa/mocking", "packages/mocking/dist"],
  ["@apixa/react", "packages/react/dist"],
  ["apixa", "dist"],
];
let builtChecked = 0;

// The built React package: from its server-safe entry, following relative chunks, React never appears.
function builtClosure(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    for (const spec of specifiersOf(readFileSync(file, "utf8"))) {
      if (spec.startsWith(".")) {
        const target = resolve(dirname(file), spec);
        queue.push(file.endsWith(".d.ts") ? target.replace(/\.js$/, ".d.ts") : target);
      }
    }
  }
  return seen;
}
for (const [name, dir] of builtDirs) {
  for (const file of listBuilt(join(root, dir))) {
    builtChecked++;
    const text = readFileSync(file, "utf8");
    for (const spec of specifiersOf(text)) {
      if (spec.startsWith(".")) {
        const target = resolve(dirname(file), spec);
        const resolved = file.endsWith(".d.ts") ? target.replace(/\.js$/, ".d.ts") : target;
        if (!existsSync(resolved)) fail("dist-resolve", `${rel(file)} cannot resolve ${spec}`);
        continue;
      }
      if (spec.startsWith("@apixa/internal-")) {
        fail("private-in-dist", `${rel(file)} has an unresolved private specifier ${spec}`);
      }
      if (name === "apixa" && spec.startsWith("@apixa/")) {
        fail("private-in-dist", `${rel(file)} has an unresolved private specifier ${spec}`);
      }
      if (
        name === "apixa" &&
        !isBuiltin(spec) &&
        !/^(react|react-dom|@tanstack\/react-query)(\/|$)/.test(spec)
      ) {
        fail("facade-dist", `${rel(file)} imports an undeclared external ${spec}`);
      }
      if (
        name === "@apixa/core" &&
        (FRAMEWORK_PACKAGES.test(spec) || isBuiltin(spec) || packageOf(spec).startsWith("@apixa/"))
      ) {
        fail("framework-leak", `${rel(file)} (Core output) imports ${spec}`);
      }
    }
  }
}

for (const [label, entry] of [
  ["@apixa/react/advanced", join(root, "packages/react/dist/advanced.js")],
  ["apixa/react/advanced", join(root, "dist/react/advanced.js")],
]) {
  for (const file of builtClosure(entry)) {
    for (const spec of specifiersOf(readFileSync(file, "utf8"))) {
      if (REACT_RUNTIME.test(spec))
        fail("react-in-server-entry", `${rel(file)} (built ${label}) imports ${spec}`);
    }
  }
}
{
  const reactIndex = join(root, "packages/react/dist/index.js");
  if (existsSync(reactIndex) && !readFileSync(reactIndex, "utf8").startsWith('"use client";')) {
    fail("client-directive", 'packages/react/dist/index.js must start with "use client"');
  }
  const facadeReact = join(root, "dist/react/index.js");
  if (existsSync(facadeReact) && !readFileSync(facadeReact, "utf8").startsWith('"use client";')) {
    fail("client-directive", 'dist/react/index.js must start with "use client"');
  }
}

// Edge-safe built output: no Node built-in imports and no Node globals, anywhere an edge-safe entry reaches.
{
  const EDGE_SAFE_BUILT = [
    "packages/core/dist/index.js",
    "packages/mocking/dist/index.js",
    "packages/mocking/dist/register.js",
    "packages/mocking/dist/datasets.js",
    ...(existsSync(join(root, "packages/mocking/dist/dataset-modules"))
      ? readdirSync(join(root, "packages/mocking/dist/dataset-modules"))
          .filter((f) => f.endsWith(".js"))
          .map((f) => `packages/mocking/dist/dataset-modules/${f}`)
      : []),
    "packages/react/dist/index.js",
    "packages/react/dist/advanced.js",
    ...[
      "index.js",
      "core.js",
      "mocking/index.js",
      "mocking/register.js",
      "mocking/datasets/index.js",
      "react/index.js",
      "react/advanced.js",
    ].map((f) => `dist/${f}`),
  ].map((f) => join(root, f));
  const NODE_GLOBALS =
    /\bprocess\.(env|versions|platform|cwd|nextTick|argv)\b|\bBuffer\.|\brequire\(|\b__dirname\b|\b__filename\b/;
  const seen = new Set();
  for (const entry of EDGE_SAFE_BUILT) {
    for (const file of builtClosure(entry)) {
      if (seen.has(file)) continue;
      seen.add(file);
      const text = readFileSync(file, "utf8");
      for (const spec of specifiersOf(text)) {
        if (isBuiltin(spec)) fail("node-leak", `${rel(file)} (built, edge-safe) imports ${spec}`);
      }
      if (file.endsWith(".js") && NODE_GLOBALS.test(text)) {
        fail(
          "node-leak",
          `${rel(file)} (built, edge-safe) references a Node global: ${text.match(NODE_GLOBALS)[0]}`,
        );
      }
      if (/\/Users\/|\/home\/[a-z]|[A-Z]:\\Users\\/.test(text)) {
        fail("local-path", `${rel(file)} embeds a local absolute path`);
      }
    }
  }
}

// One implementation of Core: only Core's own build defines its classes and mock engine.
{
  const DEFINITIONS =
    /(?:^|\n)\s*(?:var|let|const|class)\s+(?:ApiError|HttpError|MockStore|MockError)\b\s*(?:=|extends|\{)/;
  for (const [label, dir] of [
    ["@apixa/mocking", "packages/mocking/dist"],
    ["@apixa/react", "packages/react/dist"],
  ]) {
    for (const file of listBuilt(join(root, dir))) {
      if (file.endsWith(".js") && DEFINITIONS.test(readFileSync(file, "utf8"))) {
        fail(
          "duplicate-core",
          `${rel(file)} (${label}) defines a Core class; Core must be imported, never bundled`,
        );
      }
    }
  }
}

// Emitted runtime cycles can arise even when source modules are acyclic.
{
  const files = listBuilt(join(root, "dist")).filter((file) => file.endsWith(".js"));
  const cycle = findCycle(files, (file) =>
    readImports(file)
      .filter((edge) => edge.kind === "static" && edge.spec.startsWith("."))
      .map((edge) => resolve(dirname(file), edge.spec))
      .filter((target) => files.includes(target)),
  );
  if (cycle) fail("cycle", `emitted module cycle: ${cycle.map(rel).join(" -> ")}`);
}

// Distribution entry closures: framework-free declarations and runtime, including indirect chunks.
for (const [subpath, target] of Object.entries(manifests.apixa.exports)) {
  for (const output of [target.import, target.types]) {
    for (const file of builtClosure(join(root, output))) {
      const text = readFileSync(file, "utf8");
      for (const spec of specifiersOf(text)) {
        if (!subpath.startsWith("./react") && FRAMEWORK_PACKAGES.test(spec))
          fail("facade-dist", `${rel(file)} leaks ${spec} into ${subpath}`);
        if (subpath !== "./mocking/node" && isBuiltin(spec))
          fail("node-leak", `${rel(file)} leaks ${spec} into ${subpath}`);
      }
      if (
        subpath === "./react/advanced" &&
        file.endsWith(".js") &&
        /^['"]use client['"];/.test(text)
      )
        fail("client-directive", `${rel(file)} is a client boundary reachable from advanced`);
    }
  }
}
// A single runtime definition for each singleton, including React internals. Private dev builds
// are separate test artifacts and deliberately excluded from this published-distribution count.
for (const symbol of [
  "ApiError",
  "HttpError",
  "MockError",
  "MockStore",
  "QueryClient",
  "ResourceMutationStore",
  "OptimisticLayers",
  "ApixaProvider",
]) {
  const definition = new RegExp(
    `(?:var|let|const|class|function)\\s+${symbol}\\b\\s*(?:=|extends|\\{|\\()`,
    "g",
  );
  const sites = listBuilt(join(root, "dist"))
    .filter((f) => f.endsWith(".js"))
    .flatMap((file) => [...readFileSync(file, "utf8").matchAll(definition)].map(() => rel(file)));
  if (existsSync(join(root, "dist/index.js")) && sites.length !== 1)
    fail(
      "duplicate-core",
      `${symbol} must have exactly one implementation; found ${sites.length}: ${sites.join(", ")}`,
    );
}

// --- Report ---------------------------------------------------------------------------------------------

if (violations.length) {
  console.error(`Architecture check failed (${violations.length}):`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(
  `Architecture check passed: ${graph.size} source modules in ${Object.keys(PACKAGES).length} packages, ` +
    `${builtChecked} built files, no forbidden imports, cycles, or leaks.`,
);
