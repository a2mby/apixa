// Emit one declaration per canonical source module. Unlike multi-entry declaration bundling,
// this preserves unique symbols/module augmentation and never adds unrelated React imports.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = ts.readConfigFile(resolve(root, "tsconfig.publish.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, {
  noEmit: false,
  emitDeclarationOnly: true,
  declaration: true,
  declarationMap: false,
  sourceMap: false,
  rootDir: root,
  outDir: resolve(root, "dist/types"),
});
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (f) => f,
      getNewLine: () => "\n",
    }),
  );
}

const emitted = new Set();
const result = program.emit(undefined, (file, text) => {
  assert.ok(file.endsWith(".d.ts"), `Unexpected declaration artifact: ${file}`);
  // All private specifiers are resolved by the same TS paths used by the runtime build.
  // Rewrite only module specifiers, never public names or documentation prose.
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const edits = [];
  const visit = (node) => {
    const spec =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
          ? node.argument.literal
          : undefined;
    if (spec && ts.isStringLiteral(spec) && spec.text.startsWith("@apixa/")) {
      const resolved = ts.resolveModuleName(
        spec.text,
        resolve(root, "src/index.ts"),
        parsed.options,
        ts.sys,
      ).resolvedModule;
      assert.ok(
        resolved && !resolved.isExternalLibraryImport,
        `Unresolved private declaration: ${spec.text}`,
      );
      const target = resolve(root, "dist/types", relative(root, resolved.resolvedFileName)).replace(
        /\.tsx?$/,
        ".js",
      );
      let path = relative(dirname(file), target).replaceAll("\\", "/");
      if (!path.startsWith(".")) path = `./${path}`;
      edits.push([spec.getStart(source), spec.end, JSON.stringify(path)]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) {
    text = text.slice(0, start) + replacement + text.slice(end);
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  emitted.add(file);
});
assert.equal(
  result.diagnostics.length,
  0,
  ts.formatDiagnostics(result.diagnostics, {
    getCurrentDirectory: () => root,
    getCanonicalFileName: (f) => f,
    getNewLine: () => "\n",
  }),
);

const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
for (const target of Object.values(manifest.exports)) {
  const file = resolve(root, target.types);
  const source = resolve(root, "dist/types/src", relative(resolve(root, "dist"), file));
  assert.ok(emitted.has(source), `Missing entry declaration: ${source}`);
  let path = relative(dirname(file), source)
    .replace(/\.d\.ts$/, ".js")
    .replaceAll("\\", "/");
  if (!path.startsWith(".")) path = `./${path}`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `export * from ${JSON.stringify(path)};\n`);
}
console.log(
  `Declarations: ${emitted.size} canonical modules; ${Object.keys(manifest.exports).length} public entries.`,
);
