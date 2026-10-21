export type MessageParams = Record<string, string | number>;
/** A user-facing message: `key` is the source-language catalog entry, never pre-translated. */
export interface Message {
  key: string;
  params?: MessageParams;
}

const interpolate = (key: string, params: MessageParams) =>
  key.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  );

/** Errors carry their catalog key and parameters, so translation never parses messages. */
export class AppError extends Error {
  constructor(
    readonly key: string,
    readonly params: MessageParams = {},
  ) {
    super(interpolate(key, params));
  }
}

export function messageOf(reason: unknown, fallback: string): Message {
  if (reason instanceof AppError) return { key: reason.key, params: reason.params };
  return { key: reason instanceof Error && reason.message ? reason.message : fallback };
}

export const formatCount = (value: number) => value.toLocaleString('en-US');
