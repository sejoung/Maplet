import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import english from '../../src/i18n/locales/en.json';
import { detectLanguage, translate } from '../../src/i18n/core';
import {
  getLanguage,
  initializeLanguage,
  setLanguage,
  subscribeLanguage,
  LANGUAGE_STORAGE_KEY,
} from '../../src/i18n/locale';

afterEach(() => {
  vi.restoreAllMocks();
  setLanguage('ko');
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

describe('language selection and translation', () => {
  it('prefers saved settings, supported browser languages, then English', () => {
    expect(detectLanguage(['ko-KR'], 'en')).toBe('en');
    expect(detectLanguage(['en-US'], 'ko')).toBe('ko');
    expect(detectLanguage(['ja-JP', 'KO_kr'], 'invalid')).toBe('ko');
    expect(detectLanguage(['en-GB'])).toBe('en');
    expect(detectLanguage(['ja-JP'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });
  it('interpolates without interpreting content and handles English plurals', () => {
    expect(translate('파일', 'en')).toBe('File');
    expect(translate('파일', 'ko')).toBe('파일');
    expect(translate('노드 {count}개', 'en', { count: 1 })).toBe('1 node');
    expect(translate('노드 {count}개', 'en', { count: 2 })).toBe('2 nodes');
    expect(translate('노드 {count}개', 'ko', { count: 2 })).toBe('노드 2개');
    expect(
      translate('이 기기에 저장된 {filename} 초안이 있습니다.', 'en', {
        filename: '<script>{name}</script>.maplet',
      }),
    ).toBe('A draft of <script>{name}</script>.maplet is saved on this device.');
    expect(translate('Unknown API error', 'en')).toBe('Unknown API error');
    expect(translate('노드 {count}개', 'ko')).toBe('노드 {count}개');
  });
  it('translates dynamic adapter errors and combined compatibility notices', () => {
    expect(translate('파일 크기는 10 MiB 이하여야 합니다.', 'en')).toBe(
      'Files must be 10 MiB or smaller.',
    );
    expect(translate('Drive 파일 크기는 50 MiB 이하여야 합니다.', 'en')).toBe(
      'Drive files must be 50 MiB or smaller.',
    );
    expect(translate('Drive 요청이 실패했습니다 (500). 로컬 사본은 유지됩니다.', 'en')).toBe(
      'Drive request failed (500). Your local copy is safe.',
    );
    const first = '일부 첨부 콘텐츠는 화면에 표시하지 않고 원본 그대로 보존합니다.';
    const second = '교차 연결·아이콘·리소스는 원본에 보존되며 화면 표현이 제한될 수 있습니다.';
    expect(translate(`${first} ${second}`, 'en')).toBe(
      `${translate(first, 'en')} ${translate(second, 'en')}`,
    );
  });
  it('persists selection, updates metadata, and notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLanguage(listener);
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Maplet — Mind map editor');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    setLanguage('ko');
    expect(listener).toHaveBeenCalledOnce();
  });
  it('keeps language selection usable when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ko-KR']);
    initializeLanguage();
    expect(getLanguage()).toBe('ko');
    expect(() => setLanguage('en')).not.toThrow();
    expect(getLanguage()).toBe('en');
  });
  it('restores preferences and localizes the page description', () => {
    const description = document.createElement('meta');
    description.name = 'description';
    document.head.append(description);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    initializeLanguage();
    expect(getLanguage()).toBe('en');
    expect(description.content).toContain('local-first mind map editor');
    description.remove();
  });
});

it('covers source messages and preserves all interpolation parameters', () => {
  const catalog: Record<string, string | { one: string; other: string }> = english;
  const tokens = (text: string) => [...text.matchAll(/\{\w+\}/g)].map((match) => match[0]).sort();
  for (const [source, value] of Object.entries(catalog)) {
    for (const translation of typeof value === 'string' ? [value] : [value.one, value.other]) {
      expect(translation.trim()).not.toBe('');
      expect(tokens(translation)).toEqual(tokens(source));
    }
  }
  const files = (path: string): string[] =>
    readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
      const next = resolve(path, entry.name);
      return entry.isDirectory()
        ? entry.name === 'i18n'
          ? []
          : files(next)
        : /\.tsx?$/.test(next)
          ? [next]
          : [];
    });
  const missing = new Set<string>();
  for (const path of files(resolve('src'))) {
    const ast = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node) => {
      if (
        ts.isStringLiteral(node) &&
        /[가-힣]/u.test(node.text) &&
        node.text !== '검증' &&
        translate(node.text, 'en') === node.text
      )
        missing.add(node.text);
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  expect([...missing]).toEqual([]);
});
