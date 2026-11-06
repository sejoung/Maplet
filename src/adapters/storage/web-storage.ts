/**
 * Guarded Web Storage. Privacy settings, sandboxed frames and full quotas make every access
 * throw, and the app keeps working without it, so failures read as absent and writes are
 * dropped.
 */
export type StorageScope = 'local' | 'session';
// Even the accessor can throw, so it is read inside each guard.
const storageOf = (scope: StorageScope) =>
  scope === 'local' ? window.localStorage : window.sessionStorage;

export function readItem(scope: StorageScope, key: string): string | null {
  try {
    return storageOf(scope).getItem(key);
  } catch {
    return null;
  }
}

/** Store `value`, or remove the key when it is null. */
export function writeItem(scope: StorageScope, key: string, value: string | null): void {
  try {
    if (value === null) storageOf(scope).removeItem(key);
    else storageOf(scope).setItem(key, value);
  } catch {
    // The current session keeps its in-memory state.
  }
}

/** Parsed JSON, or null when absent, unreadable or malformed. */
export function readJsonItem(scope: StorageScope, key: string): unknown {
  try {
    return JSON.parse(readItem(scope, key) ?? 'null');
  } catch {
    return null;
  }
}

export function writeJsonItem(scope: StorageScope, key: string, value: object | null): void {
  writeItem(scope, key, value === null ? null : JSON.stringify(value));
}

export function removeItems(scope: StorageScope, matches: (key: string) => boolean): void {
  try {
    const storage = storageOf(scope);
    for (const key of Object.keys(storage)) if (matches(key)) storage.removeItem(key);
  } catch {
    // Nothing stored is reachable either.
  }
}
