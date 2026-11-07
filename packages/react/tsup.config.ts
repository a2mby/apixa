import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "tsup";

// `@apixa/internal-shared` is a private workspace package: it is a devDependency, so tsup bundles
// its runtime into dist, and mapping it to source for declarations inlines its types, leaving no
// unpublished specifier.
const dts = {
  compilerOptions: {
    baseUrl: ".",
    paths: { "@apixa/internal-shared": ["../internal/shared/src/index.ts"] },
  },
};

// One build with code splitting, so both entries share a single copy of every common module
// (QueryClient, OptimisticLayers, the mutation store): the hooks and `@apixa/react/advanced` then
// agree on identity. Only the hook entry is a client boundary. Its modules are not reachable from
// `advanced`, which stays free of React so Server Components can import it for prefetching.
export default defineConfig({
  entry: { index: "src/index.ts", advanced: "src/advanced.ts" },
  format: ["esm"],
  dts,
  splitting: true,
  clean: true,
  async onSuccess() {
    const file = new URL("./dist/index.js", import.meta.url);
    const code = readFileSync(file, "utf8");
    if (!code.startsWith('"use client";')) writeFileSync(file, `"use client";\n${code}`);
  },
});
