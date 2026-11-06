/** Whether `value` is one of `options`, narrowing it to their union (stored JSON is untyped). */
export const isOneOf = <T>(options: readonly T[], value: unknown): value is T =>
  (options as readonly unknown[]).includes(value);

/** A present, non-empty string; stored IDs, names and tokens must have one. */
export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;
