# Enforcement configuration examples

**Why it exists:** copyable ESLint, dependency-cruiser, and Madge configurations for boundary and cycle enforcement, split from [enforcement](enforcement.md) to keep it short.
**Use when:** adding or changing import-boundary or cycle rules after reading the enforcement procedure.
**Do not use when:** the repo already enforces the boundary (extend its rules instead), or the task is advisory only. Pasting these unadapted misses relative imports, aliases, or the repo's existing restricted patterns.

## ESLint: minimal pattern

```js
// eslint.config.js (excerpt)
{
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["@/features/*/internal/*", "@/features/*/_shared/*"],
          message: "Import from the feature's public index only." }
      ]
    }]
  }
}
```

This excerpt matches import strings only and also blocks the owner's own alias imports if applied globally. It does not catch relative paths or every nested path. Scope restrictions by **importer** and supplement with a resolved-path rule (below) or `eslint-plugin-boundaries` configured for the installed version.

## ESLint: owner-scoped flat configuration

Complete example for a standalone TypeScript app rooted at `src`. Merge the generated rule objects into the existing flat config; preserve existing restricted patterns when two configs apply to the same file, because ESLint replaces that rule's options rather than concatenating them. Do not replace a Next.js config with this standalone example.

```js
// eslint.config.mjs
import fs from "node:fs";
import tsParser from "@typescript-eslint/parser";

const sourceRoot = "src"; // monorepo root: "apps/web/src"
const featureRoot = `${sourceRoot}/features`;
const features = fs
  .readdirSync(featureRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

export default [
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**"] },
  {
    files: [`${sourceRoot}/**/*.{ts,tsx}`],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
  },
  // One object per importer owner prevents one feature's rule from
  // overwriting another's restrictions on the same importing file.
  ...[null, ...features].map((owner) => ({
    files: [owner ? `${featureRoot}/${owner}/**/*.{ts,tsx}` : `${sourceRoot}/**/*.{ts,tsx}`],
    ignores: owner ? [] : [`${featureRoot}/**`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: features
            .filter((name) => name !== owner)
            .map((name) => ({
              group: [`@/features/${name}/**`],
              message: `Import @/features/${name}, its public entry only.`,
            })),
        },
      ],
    },
  })),
];
```

This keeps same-capability private imports legal while denying alias deep imports by other capabilities/routes/shared code. It still needs resolved-path enforcement for relative imports and aliases not listed. A split server/browser capability needs explicitly named public entries, plus environment restrictions; never whitelist its whole directory to support one entry.

## dependency-cruiser: resolved boundaries and cycles

Example for an installed `dependency-cruiser` with TypeScript resolution. It generates rules for every existing feature, so adding one does not silently omit protection. Adapt `sourceRoot`, `tsConfig`, and intentional public entries to the project before enabling it.

```js
// .dependency-cruiser.cjs
const fs = require("node:fs");
const sourceRoot = "src"; // "apps/web/src" from a monorepo root
const tsConfig = "tsconfig.json"; // "apps/web/tsconfig.json"
const featureRoot = `${sourceRoot}/features`;
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const features = fs
  .readdirSync(featureRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-unresolved",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    ...features.map((name) => {
      const root = `${escape(featureRoot)}/${escape(name)}/`;
      return {
        name: `public-entry-${name}`,
        severity: "error",
        from: { path: `^${escape(sourceRoot)}/`, pathNot: `^${root}` },
        to: { path: `^${root}(?!index\\.ts$)` },
      };
    }),
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: tsConfig },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: [".ts", ".tsx", ".js", ".jsx", ".json"] },
  },
};
```

Run with the local executable through an existing/newly authorized script:

```sh
depcruise --config .dependency-cruiser.cjs src
```

Resolved paths catch both relative and aliased imports into `internal/`, `_shared/`, and other private files. Internal functional module direction still needs named rules from the Module Map, for example `from.path: "^src/features/chat/realtime/"` to UI modules is forbidden. Add those edges deliberately, not a blanket ban on sibling collaboration. Dynamic imports with computed paths need separate review.

## Madge: cycle inspection alternative

```sh
madge --circular --extensions ts,tsx --ts-config tsconfig.json src
# A Square, from repo root, if Madge is installed:
madge --circular --extensions ts,tsx --ts-config apps/web/tsconfig.json apps/web/src
```

Inspect skipped/unresolved files and reported cycles; do not infer a clean graph solely from exit status. Ensure aliases resolve and use a CI failure policy for cycles if the installed CLI does not fail automatically. Madge reports cycles; it does not enforce capability privacy. Do not add both graph tools unless they serve distinct required checks.
