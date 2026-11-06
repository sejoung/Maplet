import { translate, type Language } from '../i18n/core';
import { getLanguage, initializeLanguage, subscribeLanguage } from '../i18n/locale';
import { readItem, writeItem } from './storage/web-storage';

export const LANGUAGE_STORAGE_KEY = 'maplet-language';

/** Present the page in `language`: its `lang`, title and search description. */
export function showLanguage(language: Language): void {
  document.documentElement.lang = language;
  document.title = translate('meta.title', language);
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', translate('meta.description', language));
}

/**
 * Start in the saved or browser language, then remember every choice and keep the page in
 * step with it. Returns the unsubscribe for tests; the app keeps it for its lifetime.
 */
export function startPageLanguage(): () => void {
  const preferred = navigator.languages.length ? navigator.languages : [navigator.language];
  initializeLanguage(preferred, readItem('local', LANGUAGE_STORAGE_KEY));
  showLanguage(getLanguage());
  return subscribeLanguage(() => {
    writeItem('local', LANGUAGE_STORAGE_KEY, getLanguage());
    showLanguage(getLanguage());
  });
}
