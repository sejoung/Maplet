export const DRAFT_PRIVACY_KEY = 'maplet:keep-local-drafts';
export function keepLocalDrafts(): boolean {
  try {
    return localStorage.getItem(DRAFT_PRIVACY_KEY) !== 'false';
  } catch {
    return true;
  }
}
export function rememberLocalDrafts(enabled: boolean): void {
  try {
    localStorage.setItem(DRAFT_PRIVACY_KEY, String(enabled));
  } catch {
    /* The current setting still applies. */
  }
}
