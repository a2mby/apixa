/** Opt in to Core named datasets without making Mocking a Core dependency. */
import { registerMockDatasetLoader } from "@apixa/core";
import { loadDatasetRecords } from "./loader.js";

registerMockDatasetLoader(loadDatasetRecords);
