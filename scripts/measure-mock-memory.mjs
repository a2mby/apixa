// Measures heap held by a mock store after loading a built-in dataset.
// Run: pnpm build && node --expose-gc scripts/measure-mock-memory.mjs
import { MockStore } from "../packages/core/dist/index.js";
import { readFileSync } from "node:fs";

const file = new URL("../datasets/geography/countries-csc/data.json", import.meta.url);
const records = JSON.parse(readFileSync(file, "utf8"));
const COPIES = 20;
const mb = (n) => (n / 1024 / 1024).toFixed(2);

async function heapFor(immutable) {
  globalThis.gc();
  const before = process.memoryUsage().heapUsed;
  const stores = [];
  for (let i = 0; i < COPIES; i++) {
    const store = new MockStore({ label: "m", idKey: "id", load: () => records, immutable });
    await store.ready();
    stores.push(store);
  }
  globalThis.gc();
  const used = process.memoryUsage().heapUsed - before;
  stores.length = 0;
  return used;
}

console.log(`dataset: countries-csc, ${records.length} records, ${COPIES} independent stores`);
const snapshot = await heapFor(false);
const shared = await heapFor(true);
console.log(
  `private snapshot + working rows : ${mb(snapshot)} MB (${mb(snapshot / COPIES)} MB/store)`,
);
console.log(`shared source  + working rows   : ${mb(shared)} MB (${mb(shared / COPIES)} MB/store)`);
console.log(`saved: ${(((snapshot - shared) / snapshot) * 100).toFixed(0)}%`);
