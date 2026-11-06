import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Autocomplete is the product here, and `tsc` passing proves nothing about it. These tests open
 * a virtual file in the TypeScript language service and ask for completions at the cursor (`|`).
 */
const testsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testsDir, "..");
const virtualFile = path.join(testsDir, "__completions__.ts");

const parsed = ts.getParsedCommandLineOfConfigFile(
  path.join(root, "tsconfig.json"),
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    },
  },
)!;

let source = "";
const service = ts.createLanguageService({
  getScriptFileNames: () => [virtualFile],
  getScriptVersion: (file) => (file === virtualFile ? String(source.length) + source : "1"),
  getScriptSnapshot: (file) =>
    file === virtualFile
      ? ts.ScriptSnapshot.fromString(source)
      : ts.sys.fileExists(file)
        ? ts.ScriptSnapshot.fromString(ts.sys.readFile(file)!)
        : undefined,
  getCurrentDirectory: () => root,
  getCompilationSettings: () => parsed.options,
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  fileExists: (file) => file === virtualFile || ts.sys.fileExists(file),
  readFile: (file) => (file === virtualFile ? source : ts.sys.readFile(file)),
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
});

/** Completion names at the `|` in `code` (a `defineMockApi` import is prepended). */
function complete(code: string): string[] {
  const header = 'import { defineMockApi } from "@apixa/mocking";\n';
  const cursor = code.indexOf("|");
  source = header + code.replace("|", "");
  const info = service.getCompletionsAtPosition(virtualFile, header.length + cursor, {});
  return (info?.entries ?? []).map((entry) => entry.name);
}

function diagnostics(code: string): string[] {
  source = 'import { defineMockApi } from "@apixa/mocking";\n' + code;
  return service
    .getSemanticDiagnostics(virtualFile)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

describe("defineMockApi autocomplete (TypeScript language service)", () => {
  it("suggests the root config in a blank call", () => {
    const names = complete("defineMockApi({ | });");
    expect(names).toEqual(
      expect.arrayContaining([
        "resources",
        "defaultOperations",
        "readOnly",
        "writeOnly",
        "operationGroups",
      ]),
    );
    expect(names).not.toContain("baseURL");
  });

  it("suggests the resource config inside resources.<name>", () => {
    const names = complete("defineMockApi({ resources: { users: { | } } });");
    expect(names).toEqual(
      expect.arrayContaining(["type", "slice", "pagination", "operations", "readOnly"]),
    );
  });

  it("suggests dataset ids for `type`", () => {
    const names = complete('defineMockApi({ resources: { users: { type: "|" } } });');
    expect(names).toEqual(expect.arrayContaining(["users-mock", "products-mock"]));
  });

  it("suggests the builtin operation names inside `operations`", () => {
    const names = complete(
      'defineMockApi({ resources: { u: { type: "users-mock", operations: { | } } } });',
    );
    expect(names).toEqual(
      expect.arrayContaining(["getById", "getBySlug", "getMany", "delete", "deleteMany", "upsert"]),
    );
  });

  it("suggests the group names inside `operationGroups`", () => {
    const names = complete(
      'defineMockApi({ resources: { u: { type: "users-mock", operationGroups: { | } } } });',
    );
    expect(names).toEqual(expect.arrayContaining(["read", "write", "many", "extended"]));
  });

  it("offers exactly the enabled methods on the returned client", () => {
    const code = `const api = defineMockApi({
      readOnly: true,
      resources: {
        users: { type: "users-mock", operations: { getBySlug: false } },
        products: { type: "products-mock", readOnly: false, operations: { delete: false } },
      },
    });
    const a = api.users.|;
    `;
    const users = complete(code);
    expect(users).toEqual(expect.arrayContaining(["getAll", "getById", "getMany", "count"]));
    for (const gone of ["create", "update", "delete", "getBySlug"]) {
      expect(users).not.toContain(gone);
    }

    const products = complete(code.replace("api.users.|", "api.products.|"));
    expect(products).toEqual(expect.arrayContaining(["create", "patch", "getBySlug"]));
    expect(products).not.toContain("delete");
  });

  it("types handler arguments with no annotation", () => {
    const code = `const api = defineMockApi({ resources: { users: { type: "users-mock", operations: {
      getById: async (ctx, id) => (await ctx.rows()).find((r) => r.id === id)!,
      total: async (ctx) => (await ctx.rows()).length,
    } } } });
    api.users.total().then((n: number) => n);
    api.users.getById("1").then((u) => u.email.length);`;
    expect(diagnostics(code)).toEqual([]);
  });
});
