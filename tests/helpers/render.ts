/**
 * Read fields during render, as a component would. TanStack only re-renders for fields read
 * during render (tracked properties), so tests asserting later values must read them here.
 */
export function readsDuringRender<T extends object>(result: T, ...fields: (keyof T)[]): T {
  for (const field of fields) void result[field];
  return result;
}
