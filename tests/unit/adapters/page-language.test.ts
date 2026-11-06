// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { LANGUAGE_STORAGE_KEY, startPageLanguage } from '../../../src/adapters/page-language';
import { getLanguage, setLanguage } from '../../../src/i18n/locale';

let stop = () => {};
afterEach(() => {
  stop();
  vi.restoreAllMocks();
  setLanguage('ko');
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

it('persists the selection and names the page in the chosen language', () => {
  stop = startPageLanguage();
  setLanguage('en');
  expect(document.documentElement.lang).toBe('en');
  expect(document.title).toBe('Maplet — Mind map editor');
  expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
});

it('restores the saved language and localizes the page description', () => {
  const description = document.createElement('meta');
  description.name = 'description';
  document.head.append(description);
  localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
  stop = startPageLanguage();
  expect(getLanguage()).toBe('en');
  expect(document.documentElement.lang).toBe('en');
  expect(description.content).toContain('local-first mind map editor');
  description.remove();
});

it('keeps language selection usable when browser storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ko-KR']);
  stop = startPageLanguage();
  expect(getLanguage()).toBe('ko');
  expect(() => setLanguage('en')).not.toThrow();
  expect(getLanguage()).toBe('en');
});
