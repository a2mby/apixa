import type { ApixaClient, MockedResource } from "../types/inference.js";
import { MockFileStorage } from "../mock/index.js";
import { mockFileStorage, resetMockState } from "./client.js";

/**
 * Restore mocked records to their initial seeded state. Accepts only a mocked resource
 * (`resetMock(api.users)`) — a live resource is a type error — or a whole client (`resetMock(api)`),
 * which resets every mocked resource on it.
 */
export function resetMock(target: MockedResource | ApixaClient): void {
  resetMockState(target);
}

/**
 * The virtual file store of a mocked resource (`mockFiles(api.users)`) or client (`mockFiles(api)`):
 * inspect, list, retrieve or delete the files that mocked writes stored. A client without any
 * mocked resource gets an empty store.
 */
export function mockFiles(target: MockedResource | ApixaClient): MockFileStorage {
  return mockFileStorage(target) ?? new MockFileStorage();
}
