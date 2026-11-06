import { describe, expect, it } from 'vitest';
import {
  formatShortcut,
  historyShortcut,
  titleKey,
} from '../../../src/components/rich-text/rich-shortcuts';

const keys = (key: string, fields: Partial<KeyboardEvent> = {}) =>
  ({
    key,
    code: '',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...fields,
  }) as KeyboardEvent;

describe('rich text shortcuts', () => {
  it('formats with the chosen highlighter color, also on other keyboard layouts', () => {
    expect(formatShortcut(keys('b', { ctrlKey: true }), 'yellow')).toEqual({ kind: 'bold' });
    expect(formatShortcut(keys('H', { metaKey: true, shiftKey: true }), 'pink')).toEqual({
      kind: 'highlight',
      color: 'pink',
    });
    expect(formatShortcut(keys('ㅑ', { ctrlKey: true, code: 'KeyI' }), 'yellow')).toEqual({
      kind: 'italic',
    });
    expect(formatShortcut(keys('b'), 'yellow')).toBeNull();
    expect(formatShortcut(keys('b', { ctrlKey: true, altKey: true }), 'yellow')).toBeNull();
  });

  it('reads undo and redo', () => {
    expect(historyShortcut(keys('z', { metaKey: true }))).toBe('undo');
    expect(historyShortcut(keys('z', { metaKey: true, shiftKey: true }))).toBe('redo');
    expect(historyShortcut(keys('y', { ctrlKey: true }))).toBe('redo');
    expect(historyShortcut(keys('z'))).toBeNull();
  });

  it('maps the title editor’s plain keys', () => {
    expect(titleKey(keys('F10', { shiftKey: true }))).toBe('menu');
    expect(titleKey(keys('ContextMenu'))).toBe('menu');
    expect(titleKey(keys('Escape'))).toBe('escape');
    expect(titleKey(keys('Enter'))).toBe('commit');
    expect(titleKey(keys('Enter', { shiftKey: true }))).toBe('newline');
    expect(titleKey(keys('Tab'))).toBe('next');
    expect(titleKey(keys('Tab', { shiftKey: true }))).toBeNull();
    expect(titleKey(keys('a'))).toBeNull();
  });
});
