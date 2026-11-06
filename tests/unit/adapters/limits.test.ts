import { expect, it } from 'vitest';
import {
  assertDepth,
  assertNodeCount,
  assertSize,
  MAX_MUP_BYTES,
  readJson,
  safeLinks,
  utf8Length,
} from '../../../src/adapters/limits';

it.each(['', 'ascii', 'é', '한글', '👨‍👩‍👧‍👦', 'a\ud800b', '\udc00'])(
  'counts UTF-8 bytes like TextEncoder: %j',
  (text) => expect(utf8Length(text)).toBe(new TextEncoder().encode(text).byteLength),
);

it('reports the size limit in MiB', () => {
  expect(() => assertSize(MAX_MUP_BYTES + 1, MAX_MUP_BYTES)).toThrow(
    'file.filesMustMibSmaller (limit: 10)',
  );
  expect(() => assertSize(10, 10)).not.toThrow();
});

it('reads JSON with the caller’s size and syntax messages', () => {
  const errors = { sizeKey: 'size.key', jsonKey: 'json.key' };
  expect(readJson('{"a":1}', 10, errors)).toEqual({ a: 1 });
  expect(() => readJson('{"a":1}', 3, errors)).toThrow('size.key');
  expect(() => readJson('{bad', 10, errors)).toThrow('json.key');
  expect(() => readJson('[1e999]', 10)).toThrow('file.invalidJson');
});

it('reports node count and depth with one message whatever the format', () => {
  expect(() => assertNodeCount(5_000)).not.toThrow();
  expect(() => assertNodeCount(5_001)).toThrow('file.mapMustHaveMostNodes (max: 5,000)');
  expect(() => assertDepth(100)).not.toThrow();
  expect(() => assertDepth(101)).toThrow('common.depthLimit (max: 100)');
});

it('keeps only links a browser may open', () => {
  expect(safeLinks(['https://a.example', 'javascript:alert(1)', 'mailto:a@b.c', ''])).toEqual([
    'https://a.example',
    'mailto:a@b.c',
  ]);
});
