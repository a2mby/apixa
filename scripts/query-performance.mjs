import { performance } from "node:perf_hooks";
import { QueryClient } from "@tanstack/react-query";
import { createResourceQueryOptions } from "../packages/tanstack-query/dist/advanced.js";

// Run after `pnpm build`: `node scripts/query-performance.mjs [iterations]`.
// This is a reproducible local baseline, not a cross-machine performance target.
const iterations = Number(process.argv[2] ?? 2_000);
if (!Number.isInteger(iterations) || iterations < 1) {
  throw new Error("iterations must be a positive integer");
}
const resource = {
  getAll: async () => [{ id: "1", name: "Ada" }],
  getById: async (id) => ({ id, name: "Ada" }),
};
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
const list = createResourceQueryOptions(resource, { queryKey: ["users"] });
const detail = createResourceQueryOptions(resource, {
  queryKey: ["users"],
  operation: "getById",
  args: ["1"],
});

await client.ensureQueryData(list);
await client.ensureQueryData(detail);

async function measure(label, run) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) await run(i);
  const elapsedMs = performance.now() - start;
  console.log(
    `${label}: ${elapsedMs.toFixed(1)} ms / ${iterations} (${((elapsedMs * 1_000) / iterations).toFixed(1)} µs/op)`,
  );
}

await measure("list options + cache hit", async () => {
  const options = createResourceQueryOptions(resource, { queryKey: ["users"] });
  await client.ensureQueryData(options);
});
await measure("detail options + cache hit", async () => {
  const options = createResourceQueryOptions(resource, {
    queryKey: ["users"],
    operation: "getById",
    args: ["1"],
  });
  await client.ensureQueryData(options);
});
console.log(`cache entries: ${client.getQueryCache().getAll().length}`);
client.clear();
