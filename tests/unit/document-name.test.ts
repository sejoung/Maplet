import { expect, it } from 'vitest';
import { filenameFromTitle, renameFilename } from '../../src/application/document-name';
import { draftHasChanges, restoreDraft } from '../../src/adapters/storage/recovery';

it.each([
  ['  나의 계획  ', '나의 계획.maplet'],
  ['plan.maplet', 'plan.maplet'],
  ['plan.MUP', 'plan.maplet'],
  ['plan.maplet.maplet', 'plan.maplet'],
  ['a/b:c', 'a_b_c.maplet'],
  ['a\nfile', 'a_file.maplet'],
  ['계획 📝.', '계획 📝.maplet'],
])('normalizes the editable filename %j', (input, expected) => {
  expect(renameFilename(input)).toBe(expected);
});
it.each(['', '   ', '.maplet', '...'])('rejects an empty filename %j', (input) => {
  expect(() => renameFilename(input)).toThrow('common.pleaseEnterFileName');
});
it.each([
  ['  첫 줄\n다음 줄  ', '첫 줄 다음 줄.maplet'],
  ['계획 / 2026: 메모', '계획 _ 2026_ 메모.maplet'],
  ['📝'.repeat(81), `${'📝'.repeat(80)}.maplet`],
  ['   ', null],
  ['...', null],
])('derives a safe filename from the root title %j', (title, expected) => {
  expect(filenameFromTitle(title)).toBe(expected);
});
it('recovers filename-only changes and remains compatible with old drafts', () => {
  const draft = {
    content: '{"id":1,"title":"Same"}',
    savedContent: '{"id":1,"title":"Same"}',
    original: null,
    filename: 'new.maplet',
    savedFilename: 'old.maplet',
    updatedAt: 1,
  };
  expect(draftHasChanges(draft)).toBe(true);
  expect(restoreDraft(draft)).toMatchObject({
    filename: 'new.maplet',
    savedFilename: 'old.maplet',
  });
  expect(draftHasChanges({ ...draft, savedFilename: 'new.maplet' })).toBe(false);
  const legacy = { ...draft, savedFilename: undefined };
  expect(draftHasChanges(legacy)).toBe(false);
  expect(restoreDraft(legacy).savedFilename).toBe('new.maplet');
  expect(draftHasChanges({ ...legacy, savedContent: '' })).toBe(true);
});
