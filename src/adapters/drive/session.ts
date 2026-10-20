/** Migration only: credentials from older versions are never restored. */
export function clearDriveSession(): void {
  for (const name of ['sessionStorage', 'localStorage'] as const) {
    try {
      const storage = window[name];
      for (const key of Object.keys(storage)) {
        if (key.startsWith('maplet:drive-session:')) storage.removeItem(key);
      }
    } catch {
      // Authentication remains memory-only when browser storage is blocked.
    }
  }
}
