// Names that would alter or shadow object behaviour when used as node keys. Other inherited
// names (e.g. "toString") are valid IDs, so lookups of possibly absent IDs must use `own`.
const reserved = new Set(['__proto__', 'constructor', 'prototype']);

export const isReservedId = (id: string) => reserved.has(id);
export const isNodeId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && !reserved.has(value);

/** Own-property lookup: absent entries never fall through to Object.prototype. */
export const own = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;
