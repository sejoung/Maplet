import { expect, it } from 'vitest';
import { assertSize, byteLimitFor, utf8Length } from '../../src/adapters/limits';

it.each(['', 'ascii', 'é', '한글', '👨‍👩‍👧‍👦', 'a\ud800b', '\udc00'])(
  'counts UTF-8 bytes like TextEncoder: %j',
  (text) => expect(utf8Length(text)).toBe(new TextEncoder().encode(text).byteLength),
);

it('applies the MindMup limit only to .mup names and reports the limit in MiB', () => {
  expect(byteLimitFor('map.MUP')).toBe(10 * 1024 * 1024);
  expect(byteLimitFor('map.maplet')).toBe(50 * 1024 * 1024);
  expect(() => assertSize(10 * 1024 * 1024 + 1, byteLimitFor('x.mup'))).toThrow(
    'file.filesMustMibSmaller (limit: 10)',
  );
  expect(() => assertSize(10, 10)).not.toThrow();
});
