import { detectLanguage, translate, type Language } from './core';

export const LANGUAGE_STORAGE_KEY = 'maplet-language';
let language: Language = 'ko';
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export const subscribeLanguage = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function applyLanguage(next: Language) {
  language = next;
  document.documentElement.lang = next;
  document.title = translate('meta.title', next);
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', translate('meta.description', next));
  listeners.forEach((listener) => listener());
}

export function setLanguage(next: Language) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {
    /* Selection still works without storage. */
  }
  applyLanguage(next);
}

export function initializeLanguage() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    /* Use browser preferences. */
  }
  applyLanguage(
    detectLanguage(navigator.languages.length ? navigator.languages : [navigator.language], saved),
  );
}

/** Each language is named in itself, whatever the interface language. */
export const LANGUAGE_NAMES: Record<Language, string> = { ko: '한국어', en: 'English' };

/** The illustrated user guide for a language, relative to the app page. */
export const manualPath = (language: Language) =>
  language === 'en' ? 'manual/en/index.html' : 'manual/index.html';
