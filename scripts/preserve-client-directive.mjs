// Ensures the React client entry of the `apixa` facade starts with the Next.js client directive.
// esbuild normally keeps an entry file's directive; this makes the guarantee explicit and fails the
// build if the entry is missing.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("../dist/react/index.js", import.meta.url));
if (!existsSync(entry)) throw new Error(`Missing ${entry}; run the facade build first.`);
const output = readFileSync(entry, "utf8");
if (!output.startsWith('"use client";')) writeFileSync(entry, `"use client";\n${output}`);
