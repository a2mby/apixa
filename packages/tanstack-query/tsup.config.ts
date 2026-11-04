import { defineConfig } from "tsup";

// The React hook entry must retain the Next.js client boundary. The advanced entry contains
// hook-free factories and controllers that server components can import for prefetching.
export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    clean: false,
    banner: { js: '"use client";' },
  },
  {
    entry: { advanced: "src/advanced.ts" },
    format: ["esm"],
    dts: true,
    clean: false,
  },
]);
