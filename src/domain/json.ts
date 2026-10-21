import type { JsonObject } from './model';

export const isJsonObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const equalJson = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a),
    right = Object.keys(b);
  return (
    left.length === right.length &&
    left.every(
      (key) =>
        Object.hasOwn(b, key) &&
        equalJson((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
};

/** JSON.parse that rejects numbers outside the finite double range (e.g. 1e400). */
export function parseFiniteJson(source: string): unknown {
  return JSON.parse(source, (_key, value: unknown) => {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new RangeError('non-finite');
    return value;
  });
}
