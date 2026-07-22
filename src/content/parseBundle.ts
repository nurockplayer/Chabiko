/**
 * Parse a JSON content bundle expected to expose a named top-level array.
 *
 * Shared by the lesson and HSK vocabulary loaders. Callers supply the message
 * builders so each bundle keeps its own error wording.
 *
 * Throws `Error(parseError(path))` when `raw` is not valid JSON, and
 * `Error(structureError(path))` when the parsed value is not an object with an
 * array under `arrayKey`.
 */
export function parseArrayBundle<T>(
  raw: string,
  path: string,
  arrayKey: string,
  parseError: (path: string) => string,
  structureError: (path: string) => string,
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(parseError(path));
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as Record<string, unknown>)[arrayKey])
  ) {
    throw new Error(structureError(path));
  }
  return parsed as T;
}
