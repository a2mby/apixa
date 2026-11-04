import type { ApixaClient, MockedResource } from "../types/inference.js";
import { resetMockState } from "./client.js";

/**
 * Restore mocked records to their initial seeded state. Accepts only a mocked resource
 * (`resetMock(api.users)`) — a live resource is a type error — or a whole client (`resetMock(api)`),
 * which resets every mocked resource on it.
 */
export function resetMock(target: MockedResource | ApixaClient): void {
  resetMockState(target);
}
