import { detectLanguage, type Language } from './core';

// The interface language as plain state; the composition root mirrors it to browser storage
// and the page (see adapters/page-language.ts), so this layer touches no browser globals.
let language: Language = 'ko';
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export const subscribeLanguage = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Start with a saved choice if any, otherwise the first supported preferred language. */
export function initializeLanguage(preferred: readonly string[], saved: string | null = null) {
  language = detectLanguage(preferred, saved);
}

export function setLanguage(next: Language) {
  language = next;
  listeners.forEach((listener) => listener());
}

/** Each language is named in itself, whatever the interface language. */
export const LANGUAGE_NAMES: Record<Language, string> = { ko: '한국어', en: 'English' };

/** The illustrated user guide for a language, relative to the app page. */
export const manualPath = (language: Language) =>
  language === 'en' ? 'manual/en/index.html' : 'manual/index.html';
