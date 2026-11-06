import { removeItems } from '../storage/web-storage';

/** Migration only: credentials from older versions are never restored. */
export function clearDriveSession(): void {
  for (const scope of ['session', 'local'] as const)
    removeItems(scope, (key) => key.startsWith('maplet:drive-session:'));
}
