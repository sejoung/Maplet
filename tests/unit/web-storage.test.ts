// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  readItem,
  readJsonItem,
  removeItems,
  writeItem,
  writeJsonItem,
} from '../../src/adapters/storage/web-storage';
import { keepLocalDrafts, rememberLocalDrafts } from '../../src/adapters/storage/privacy';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

it('reads, writes and removes items in either scope', () => {
  writeItem('local', 'k', 'local value');
  writeItem('session', 'k', 'session value');
  expect(readItem('local', 'k')).toBe('local value');
  expect(readItem('session', 'k')).toBe('session value');
  writeItem('local', 'k', null);
  expect(readItem('local', 'k')).toBeNull();
  writeJsonItem('session', 'j', { a: 1 });
  expect(readJsonItem('session', 'j')).toEqual({ a: 1 });
  writeJsonItem('session', 'j', null);
  expect(readJsonItem('session', 'j')).toBeNull();
  sessionStorage.setItem('broken', '{');
  expect(readJsonItem('session', 'broken')).toBeNull();
});

it('removes only matching keys', () => {
  localStorage.setItem('drop:1', 'x');
  localStorage.setItem('keep', 'y');
  removeItems('local', (key) => key.startsWith('drop:'));
  expect(Object.keys(localStorage)).toEqual(['keep']);
});

it('treats blocked storage as empty and drops writes', () => {
  for (const name of ['localStorage', 'sessionStorage'] as const)
    vi.spyOn(window, name, 'get').mockImplementation(() => {
      throw new Error('blocked');
    });
  expect(readItem('local', 'k')).toBeNull();
  expect(readJsonItem('session', 'k')).toBeNull();
  expect(() => writeItem('local', 'k', 'v')).not.toThrow();
  expect(() => writeItem('session', 'k', null)).not.toThrow();
  expect(() => removeItems('local', () => true)).not.toThrow();
  // Drafts stay on by default when the setting cannot be read.
  expect(keepLocalDrafts()).toBe(true);
  expect(() => rememberLocalDrafts(false)).not.toThrow();
});

it('remembers the draft privacy setting', () => {
  rememberLocalDrafts(false);
  expect(keepLocalDrafts()).toBe(false);
  rememberLocalDrafts(true);
  expect(keepLocalDrafts()).toBe(true);
});
