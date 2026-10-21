export type MessageParams = Record<string, string | number>;
/** A user-facing message: `key` names a catalog entry (such as `edit.nodeNotFound`). */
export interface Message {
  key: string;
  params?: MessageParams;
}

/** Errors carry their catalog key and parameters, so translation never parses messages. */
export class AppError extends Error {
  constructor(
    readonly key: string,
    readonly params: MessageParams = {},
  ) {
    // The developer-facing message names the key and its values, e.g. `x.y (limit: 10)`.
    const values = Object.entries(params).map(([name, value]) => `${name}: ${value}`);
    super(values.length ? `${key} (${values.join(', ')})` : key);
  }
}

export function messageOf(reason: unknown, fallback: string): Message {
  if (reason instanceof AppError) return { key: reason.key, params: reason.params };
  return { key: reason instanceof Error && reason.message ? reason.message : fallback };
}

export const formatCount = (value: number) => value.toLocaleString('en-US');
