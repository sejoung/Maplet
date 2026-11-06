import { readItem, writeItem } from './web-storage';

export const DRAFT_PRIVACY_KEY = 'maplet:keep-local-drafts';
/** On unless turned off; unreadable storage keeps the default. */
export const keepLocalDrafts = (): boolean => readItem('local', DRAFT_PRIVACY_KEY) !== 'false';
export const rememberLocalDrafts = (enabled: boolean): void =>
  writeItem('local', DRAFT_PRIVACY_KEY, String(enabled));
