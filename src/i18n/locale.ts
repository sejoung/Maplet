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
  document.title = translate('Maplet — 마인드맵 에디터', next);
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute(
      'content',
      translate('.maplet 문서를 편집하고 MindMup 파일을 가져오는 로컬 우선 마인드맵 에디터.', next),
    );
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
