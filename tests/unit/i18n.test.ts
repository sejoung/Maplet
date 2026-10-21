// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import english from '../../src/i18n/locales/en.json';
import korean from '../../src/i18n/locales/ko.json';
import { detectLanguage, translate, translateMessage } from '../../src/i18n/core';
import { AppError } from '../../src/domain/errors';
import { DriveRequestError } from '../../src/adapters/drive/client';
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
    expect(translate('header.file', 'en')).toBe('File');
    expect(translate('header.file', 'ko')).toBe('파일');
    expect(translate('editor.nodeCount', 'en', { count: 1 })).toBe('1 node');
    expect(translate('editor.nodeCount', 'en', { count: 2 })).toBe('2 nodes');
    expect(translate('editor.nodeCount', 'ko', { count: 2 })).toBe('노드 2개');
    expect(translate('app.draftFound', 'en', { filename: '<script>{name}</script>.maplet' })).toBe(
      'A draft of <script>{name}</script>.maplet is saved on this device.',
    );
    expect(translate('Unknown API error', 'en')).toBe('Unknown API error');
    expect(translate('editor.nodeCount', 'ko')).toBe('노드 {count}개');
  });
  it('translates structured errors and combined compatibility notices without parsing text', () => {
    expect(translateMessage(new AppError('file.filesMustMibSmaller', { limit: 10 }), 'en')).toBe(
      'Files must be 10 MiB or smaller.',
    );
    const request = new DriveRequestError(500);
    expect(request.key).toBe('drive.driveRequestFailedLocalCopy');
    expect(translateMessage(request, 'en')).toBe(
      'Drive request failed (500). Your local copy is safe.',
    );
    expect(translateMessage(request, 'ko')).toBe(
      'Drive 요청이 실패했습니다 (500). 로컬 사본은 유지됩니다.',
    );
    const first = 'file.attachmentsPreserved';
    const second = 'file.iconsResourcesPreserved';
    expect(translateMessage([first, second], 'en')).toBe(
      `${translate(first, 'en')} ${translate(second, 'en')}`,
    );
    // Pre-formatted text is shown as-is rather than guessed back into a template.
    expect(translate('Drive 요청이 실패했습니다 (500). 로컬 사본은 유지됩니다.', 'en')).toBe(
      'Drive 요청이 실패했습니다 (500). 로컬 사본은 유지됩니다.',
    );
  });
  it('still translates Korean sentences that older releases saved as message keys', () => {
    // Import warnings were stored in documents and drafts as Korean source text.
    expect(translate('안전하지 않은 링크는 열 수 없도록 제외했습니다.', 'en')).toBe(
      english['file.unsafeLinksRemoved'],
    );
    expect(
      translateMessage(
        ['교차 연결·리소스는 원본에 보존되며 화면 표현이 제한될 수 있습니다.'],
        'en',
      ),
    ).toBe(english['file.legacyLinksPreserved']);
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

describe('message catalogs', () => {
  const tokens = (text: string) => [...text.matchAll(/\{\w+\}/g)].map((match) => match[0]).sort();
  const catalog: Record<string, string | { one: string; other: string }> = english;
  const files = (path: string): string[] =>
    readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
      const next = resolve(path, entry.name);
      return entry.isDirectory() ? files(next) : /\.tsx?$/.test(next) ? [next] : [];
    });
  const literals = files(resolve('src')).flatMap((path) => {
    const found: { path: string; text: string; jsx: boolean }[] = [];
    const ast = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        found.push({ path, text: node.text, jsx: false });
      else if (ts.isJsxText(node) && node.text.trim())
        found.push({ path, text: node.text.trim(), jsx: true });
      ts.forEachChild(node, visit);
    };
    visit(ast);
    return found;
  });

  it('defines every key in Korean and English with the same parameters', () => {
    expect(Object.keys(english).sort()).toEqual(Object.keys(korean).sort());
    for (const [key, source] of Object.entries(korean)) {
      const value = catalog[key];
      for (const translation of typeof value === 'string' ? [value] : [value.one, value.other]) {
        expect(translation.trim(), key).not.toBe('');
        expect(tokens(translation), key).toEqual(tokens(source));
      }
    }
  });

  it('keeps interface text out of code: only keys outside the i18n folder', () => {
    const inline = literals.filter(
      ({ path, text }) => !path.includes('/src/i18n/') && /[가-힣]/u.test(text),
    );
    expect(inline).toEqual([]);
  });

  it('uses only defined keys and defines only used ones', () => {
    const namespaces = new Set(Object.keys(korean).map((key) => key.split('.')[0]));
    const referenced = new Set(
      literals
        .filter(({ jsx }) => !jsx)
        .map(({ text }) => text)
        .filter((text) => /^[a-z][a-zA-Z]*\.[a-zA-Z0-9]+$/.test(text))
        .filter((text) => namespaces.has(text.split('.')[0])),
    );
    expect([...referenced].filter((key) => !Object.hasOwn(korean, key))).toEqual([]);
    // Legacy entries exist only to translate text saved by earlier releases.
    expect(
      Object.keys(korean).filter((key) => !referenced.has(key) && !key.startsWith('file.legacy')),
    ).toEqual([]);
  });
});
