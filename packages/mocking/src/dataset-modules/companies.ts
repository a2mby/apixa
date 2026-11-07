/**
 * `@apixa/mocking/datasets/companies` — the `companies-mock` records on their own. Importing this path loads
 * only this dataset (no barrel, no other dataset module). The array is the module-cached source
 * shared by every caller: treat it as read-only.
 */
import data from "../../../../datasets/companies/companies-mock/data.json";
import type { Company } from "../data/entities.js";

export type { Company };

/** `companies-mock` */
export const companies: readonly Company[] = data;
